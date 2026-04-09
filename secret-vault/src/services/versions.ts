import { hasAccess, hasScope } from "../access.js";
import {
  ACTION_GET,
  ACTION_RESTORE,
  ACTION_VERSIONS,
  FLAG_HMAC_REQUIRED,
  SCOPE_READ,
  SCOPE_WRITE,
} from "../constants.js";
import { decryptSecretRow, verifyHmac } from "../crypto.js";
import { AccessDeniedError, EncryptionError, NotFoundError } from "../errors.js";
import { getFlag } from "../flags.js";
import type { SecretRow } from "../schemas-secrets.js";
import type { ServiceContext, VersionListItem, VersionResult } from "./types.js";

type VersionRow = {
  id: number;
  secret_key: string;
  value: string;
  iv: string;
  hmac: string;
  encrypted_dek: string | null;
  dek_iv: string | null;
  description: string;
  changed_by: string;
  changed_at: string;
};

// --- List versions ---

export async function listVersions(
  ctx: ServiceContext,
  key: string,
): Promise<{ versions: VersionListItem[] }> {
  if (!hasScope(ctx.auth, SCOPE_READ)) throw new AccessDeniedError("Insufficient scope");

  // Tag-based access control on parent secret
  const secret = await ctx.db
    .prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (!secret) throw new NotFoundError("Secret not found");
  if (!hasAccess(ctx.auth, SCOPE_READ, secret.tags))
    throw new AccessDeniedError("Access denied - secret tags do not match your role");

  const { results } = await ctx.db
    .prepare(
      "SELECT id, changed_by, changed_at FROM secret_versions WHERE secret_key = ? ORDER BY changed_at DESC",
    )
    .bind(key)
    .all();

  await ctx.auditFn(ACTION_VERSIONS, key);
  return { versions: results as VersionListItem[] };
}

// --- Get version value ---

export async function getVersion(
  ctx: ServiceContext,
  key: string,
  versionId: number,
): Promise<VersionResult> {
  if (!hasScope(ctx.auth, SCOPE_READ)) throw new AccessDeniedError("Insufficient scope");

  // Tag-based access control on parent secret
  const secret = await ctx.db
    .prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (!secret) throw new NotFoundError("Secret not found");
  if (!hasAccess(ctx.auth, SCOPE_READ, secret.tags))
    throw new AccessDeniedError("Access denied - secret tags do not match your role");

  const version = await ctx.db
    .prepare(
      "SELECT id, secret_key, value, iv, hmac, encrypted_dek, dek_iv, description, changed_by, changed_at FROM secret_versions WHERE id = ? AND secret_key = ?",
    )
    .bind(versionId, key)
    .first<VersionRow>();
  if (!version) throw new NotFoundError("Version not found");

  // Decrypt (includes HMAC verification)
  const hmacRequired = getFlag(ctx.flagCache, FLAG_HMAC_REQUIRED, false);
  let plaintext: string;
  try {
    plaintext = await decryptSecretRow(
      version,
      ctx.env.ENCRYPTION_KEY,
      key,
      ctx.env.INTEGRITY_KEY,
      { hmacRequired },
    );
  } catch (e) {
    if (e instanceof EncryptionError) throw e;
    throw new EncryptionError("Decryption failed");
  }

  await ctx.auditFn(ACTION_GET, key);
  return {
    id: version.id,
    key,
    value: plaintext,
    description: version.description,
    changed_by: version.changed_by,
    changed_at: version.changed_at,
  };
}

// --- Restore version ---

export async function restoreVersion(
  ctx: ServiceContext,
  key: string,
  versionId: number,
): Promise<{ ok: true; key: string; restored_from: number }> {
  if (!hasScope(ctx.auth, SCOPE_WRITE)) throw new AccessDeniedError("Insufficient scope");

  // Tag-based access control on parent secret
  const secret = await ctx.db
    .prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (secret && !hasAccess(ctx.auth, SCOPE_WRITE, secret.tags))
    throw new AccessDeniedError("Access denied - secret tags do not match your role");

  // Fetch the version to restore
  const version = await ctx.db
    .prepare(
      "SELECT id, secret_key, value, iv, hmac, encrypted_dek, dek_iv, description FROM secret_versions WHERE id = ? AND secret_key = ?",
    )
    .bind(versionId, key)
    .first<VersionRow>();
  if (!version) throw new NotFoundError("Version not found");

  // Verify HMAC integrity of the version being restored
  if (version.hmac) {
    const valid = await verifyHmac(
      key,
      version.value,
      version.iv,
      version.hmac,
      ctx.env.ENCRYPTION_KEY,
      ctx.env.INTEGRITY_KEY,
      version.encrypted_dek,
      version.dek_iv,
    );
    if (!valid)
      throw new EncryptionError(
        "Integrity check failed - version may have been tampered with, refusing to restore",
      );
  }

  // Save current value as a new version before overwriting
  const current = await ctx.db
    .prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();
  if (!current) throw new NotFoundError("Secret not found");

  await ctx.db.batch([
    // Archive current value (including DEK columns)
    ctx.db
      .prepare(
        "INSERT INTO secret_versions (secret_key, value, iv, hmac, encrypted_dek, dek_iv, description, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        key,
        current.value,
        current.iv,
        current.hmac,
        current.encrypted_dek,
        current.dek_iv,
        current.description,
        ctx.auth.identity,
      ),
    // Restore old version (including DEK columns)
    ctx.db
      .prepare(
        "UPDATE secrets SET value = ?, iv = ?, hmac = ?, encrypted_dek = ?, dek_iv = ?, description = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?",
      )
      .bind(
        version.value,
        version.iv,
        version.hmac,
        version.encrypted_dek,
        version.dek_iv,
        version.description,
        ctx.auth.identity,
        key,
      ),
  ]);

  await ctx.auditFn(ACTION_RESTORE, key);
  return { ok: true, key, restored_from: versionId };
}
