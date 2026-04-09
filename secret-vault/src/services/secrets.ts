import { accessibleTags, hasAccess, hasScope } from "../access.js";
import {
  ACTION_DELETE,
  ACTION_EXPIRED_ACCESS,
  ACTION_GET,
  ACTION_LIST,
  ACTION_SET,
  FLAG_BURN_AFTER_READING,
  FLAG_ENFORCE_EXPIRY,
  FLAG_HMAC_REQUIRED,
  FLAG_MAX_SECRET_SIZE_KB,
  FLAG_MAX_SECRETS,
  FLAG_MAX_TAGS_PER_SECRET,
  FLAG_MAX_VERSIONS,
  FLAG_REQUIRE_DESCRIPTION,
  FLAG_REQUIRE_ENVELOPE_ENCRYPTION,
  FLAG_REQUIRE_TAGS,
  FLAG_SECRET_NAME_PATTERN,
  FLAG_VERSIONING_ENABLED,
  SCOPE_DELETE,
  SCOPE_READ,
  SCOPE_WRITE,
} from "../constants.js";
import { decryptSecretRow, encryptSecretValue } from "../crypto.js";
import { AccessDeniedError, EncryptionError, NotFoundError, ValidationError } from "../errors.js";
import { getFlag } from "../flags.js";
import type { SecretRow } from "../schemas-secrets.js";
import type { SecretListItem, SecretResult, ServiceContext } from "./types.js";

// --- List ---

export async function listSecrets(
  ctx: ServiceContext,
  params: { limit: number; offset: number; search?: string },
): Promise<{ secrets: SecretListItem[]; total: number }> {
  if (!hasScope(ctx.auth, SCOPE_READ)) throw new AccessDeniedError("Insufficient scope");

  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (params.search) {
    const escaped = params.search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push("key LIKE ? ESCAPE '\\'");
    binds.push(`%${escaped}%`);
  }

  // Policy-based tag filtering for correct pagination
  const readable = accessibleTags(ctx.auth, SCOPE_READ);
  if (readable !== null && readable.length === 0) {
    return { secrets: [], total: 0 };
  }
  if (readable !== null && readable.length > 0) {
    const tagConditions = readable.map(() => "',' || tags || ',' LIKE ?").join(" OR ");
    conditions.push(`(${tagConditions})`);
    for (const tag of readable) {
      binds.push(`%,${tag},%`);
    }
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*) as total FROM secrets${where}`;
  const listSql = `SELECT key, description, tags, expires_at, created_by, updated_by, created_at, updated_at FROM secrets${where} ORDER BY key LIMIT ? OFFSET ?`;

  const { results: countResult } = await ctx.db
    .prepare(countSql)
    .bind(...binds)
    .all();
  const dbTotal = (countResult[0] as { total: number }).total;
  const { results } = await ctx.db
    .prepare(listSql)
    .bind(...binds, params.limit, params.offset)
    .all();

  await ctx.auditFn(ACTION_LIST, null);
  return {
    secrets: results as SecretListItem[],
    total: dbTotal,
  };
}

// --- Get ---

export async function getSecret(ctx: ServiceContext, key: string): Promise<SecretResult> {
  if (!hasScope(ctx.auth, SCOPE_READ)) throw new AccessDeniedError("Insufficient scope");

  const row = await ctx.db
    .prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();

  if (!row) throw new NotFoundError("Secret not found");

  // Policy-based access control
  if (!hasAccess(ctx.auth, SCOPE_READ, row.tags))
    throw new AccessDeniedError("Access denied - secret tags do not match your role");

  // Enforce expiry
  if (row.expires_at) {
    const enforceExpiry = getFlag(ctx.flagCache, FLAG_ENFORCE_EXPIRY, false);
    if (enforceExpiry && new Date(row.expires_at).getTime() < Date.now()) {
      await ctx.auditFn(ACTION_EXPIRED_ACCESS, key);
      throw new AccessDeniedError(`Secret expired at ${row.expires_at} - rotate or re-set it`);
    }
  }

  // Require envelope encryption
  if (!row.encrypted_dek || !row.dek_iv) {
    const requireEnvelope = getFlag(ctx.flagCache, FLAG_REQUIRE_ENVELOPE_ENCRYPTION, false);
    if (requireEnvelope)
      throw new AccessDeniedError(
        "Secret uses legacy encryption - run `hfs re-encrypt` to migrate",
      );
  }

  // Decrypt (includes HMAC verification)
  const hmacRequired = getFlag(ctx.flagCache, FLAG_HMAC_REQUIRED, false);
  let plaintext: string;
  try {
    plaintext = await decryptSecretRow(row, ctx.env.ENCRYPTION_KEY, key, ctx.env.INTEGRITY_KEY, {
      hmacRequired,
    });
  } catch (e) {
    if (e instanceof EncryptionError) throw e;
    throw new EncryptionError("Decryption failed");
  }

  await ctx.auditFn(ACTION_GET, key);

  // Burn after reading: delete secret after successful read if tagged "burn" and flag enabled
  const burnEnabled = getFlag(ctx.flagCache, FLAG_BURN_AFTER_READING, false);
  if (burnEnabled && row.tags?.split(",").some((t) => t.trim() === "burn")) {
    await ctx.db.batch([
      ctx.db.prepare("DELETE FROM secret_versions WHERE secret_key = ?").bind(key),
      ctx.db.prepare("DELETE FROM secrets WHERE key = ?").bind(key),
    ]);
    await ctx.auditFn(ACTION_DELETE, key);
  }

  return {
    key: row.key,
    value: plaintext,
    description: row.description,
    tags: row.tags,
    expires_at: row.expires_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Delete ---

export async function deleteSecret(
  ctx: ServiceContext,
  key: string,
): Promise<{ ok: true; deleted: string }> {
  if (!hasScope(ctx.auth, SCOPE_DELETE)) throw new AccessDeniedError("Insufficient scope");

  // Check tag access before deleting
  const row = await ctx.db
    .prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (!row) throw new NotFoundError("Secret not found");
  if (!hasAccess(ctx.auth, SCOPE_DELETE, row.tags))
    throw new AccessDeniedError("Access denied - secret tags do not match your role");

  // Delete versions first (explicit cleanup - FK CASCADE may not be enforced in D1)
  await ctx.db.batch([
    ctx.db.prepare("DELETE FROM secret_versions WHERE secret_key = ?").bind(key),
    ctx.db.prepare("DELETE FROM secrets WHERE key = ?").bind(key),
  ]);
  await ctx.auditFn(ACTION_DELETE, key);
  return { ok: true, deleted: key };
}

// --- Validate input ---

export function validateSecretInput(
  flagCache: Map<string, unknown>,
  key: string,
  value: string,
  description: string | undefined,
  tags: string | undefined,
): void {
  // Flag-driven input requirements
  if (!description) {
    const reqDesc = getFlag(flagCache, FLAG_REQUIRE_DESCRIPTION, false);
    if (reqDesc) throw new ValidationError("Description is required");
  }
  if (!tags) {
    const reqTags = getFlag(flagCache, FLAG_REQUIRE_TAGS, false);
    if (reqTags) throw new ValidationError("Tags are required");
  }

  // Secret name pattern enforcement (length-capped to prevent ReDoS)
  const namePattern = getFlag(flagCache, FLAG_SECRET_NAME_PATTERN, "") as string;
  if (namePattern && namePattern.length <= 200) {
    try {
      if (!new RegExp(namePattern).test(key))
        throw new ValidationError("Key does not match the required naming pattern");
    } catch (e) {
      // Re-throw ValidationError, swallow invalid regex
      if (e instanceof ValidationError) throw e;
    }
  }

  // Value size limit
  const maxSizeKb = getFlag(flagCache, FLAG_MAX_SECRET_SIZE_KB, 0);
  if (maxSizeKb > 0 && value.length > (maxSizeKb as number) * 1024)
    throw new ValidationError(`Value exceeds ${maxSizeKb}KB limit`);

  // Tag count limit
  if (tags) {
    const maxTags = getFlag(flagCache, FLAG_MAX_TAGS_PER_SECRET, 0);
    const tagCount = tags.split(",").filter((t) => t.trim()).length;
    if (maxTags > 0 && tagCount > (maxTags as number))
      throw new ValidationError(`Too many tags (${tagCount}) - maximum is ${maxTags}`);
  }
}

// --- Set (create/update) ---

export async function setSecret(
  ctx: ServiceContext,
  key: string,
  data: {
    value: string;
    description?: string;
    tags?: string;
    expires_at?: string | null;
  },
): Promise<{ ok: true; key: string }> {
  if (!hasScope(ctx.auth, SCOPE_WRITE)) throw new AccessDeniedError("Insufficient scope");

  const { value, description, tags, expires_at } = data;

  // Validate input against flags
  validateSecretInput(ctx.flagCache, key, value, description, tags);

  const existing = await ctx.db
    .prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();

  // Policy-based access control: check existing secret tags on update
  if (existing && !hasAccess(ctx.auth, SCOPE_WRITE, existing.tags))
    throw new AccessDeniedError("Access denied - secret tags do not match your role");

  // Policy-based access control: check new tags on create/update
  if (!hasAccess(ctx.auth, SCOPE_WRITE, tags || ""))
    throw new AccessDeniedError("Access denied - you cannot assign tags outside your role");

  // Enforce max_secrets limit on new keys
  if (!existing) {
    const maxSecrets = getFlag(ctx.flagCache, FLAG_MAX_SECRETS, 0);
    if (maxSecrets > 0) {
      const count = await ctx.db
        .prepare("SELECT COUNT(*) as total FROM secrets")
        .first<{ total: number }>();
      if (count && count.total >= maxSecrets)
        throw new ValidationError(`Vault limit reached (${maxSecrets} secrets)`);
    }
  }

  // Version the existing secret before overwriting
  const versioningEnabled = getFlag(ctx.flagCache, FLAG_VERSIONING_ENABLED, true);
  if (versioningEnabled && existing) {
    await ctx.db
      .prepare(
        "INSERT INTO secret_versions (secret_key, value, iv, hmac, encrypted_dek, dek_iv, description, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        key,
        existing.value,
        existing.iv,
        existing.hmac,
        existing.encrypted_dek,
        existing.dek_iv,
        existing.description,
        ctx.auth.identity,
      )
      .run();

    const maxVersions = getFlag(ctx.flagCache, FLAG_MAX_VERSIONS, 0);
    if (maxVersions > 0) {
      await ctx.db
        .prepare(
          `DELETE FROM secret_versions WHERE secret_key = ? AND id NOT IN (
           SELECT id FROM secret_versions WHERE secret_key = ? ORDER BY changed_at DESC LIMIT ?
         )`,
        )
        .bind(key, key, maxVersions)
        .run();
    }
  }

  // Encrypt the new value
  let ciphertext: string;
  let iv: string;
  let encrypted_dek: string;
  let dek_iv: string;
  let hmac: string;
  try {
    ({ ciphertext, iv, encrypted_dek, dek_iv, hmac } = await encryptSecretValue(
      value,
      ctx.env.ENCRYPTION_KEY,
      key,
      ctx.env.INTEGRITY_KEY,
    ));
  } catch {
    throw new EncryptionError("Encryption failed");
  }

  const identity = ctx.auth.identity;
  await ctx.db
    .prepare(
      `INSERT INTO secrets (key, value, iv, hmac, encrypted_dek, dek_iv, description, tags, expires_at, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, iv = excluded.iv, hmac = excluded.hmac,
       encrypted_dek = excluded.encrypted_dek, dek_iv = excluded.dek_iv,
       description = excluded.description, tags = excluded.tags,
       expires_at = excluded.expires_at,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
    )
    .bind(
      key,
      ciphertext,
      iv,
      hmac,
      encrypted_dek,
      dek_iv,
      description,
      tags,
      expires_at,
      identity,
      identity,
    )
    .run();

  await ctx.auditFn(ACTION_SET, key);
  return { ok: true, key };
}
