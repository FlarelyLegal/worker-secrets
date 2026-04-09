import { hasAccess, hasScope } from "../access.js";
import {
  ACTION_EXPORT,
  ACTION_IMPORT,
  FLAG_DISABLE_EXPORT,
  FLAG_MAX_SECRETS,
  SCOPE_READ,
  SCOPE_WRITE,
} from "../constants.js";
import { decryptSecretRow, encryptSecretValue } from "../crypto.js";
import { AccessDeniedError, EncryptionError, ValidationError } from "../errors.js";
import { getFlag } from "../flags.js";
import type { SecretRow } from "../schemas-secrets.js";
import { validateSecretInput } from "./secrets.js";
import type { ExportedSecret, ServiceContext } from "./types.js";

// --- Export ---

export async function exportSecrets(
  ctx: ServiceContext,
): Promise<{ secrets: ExportedSecret[] }> {
  if (!hasScope(ctx.auth, SCOPE_READ)) throw new AccessDeniedError("Insufficient scope");

  const exportDisabled = getFlag(ctx.flagCache, FLAG_DISABLE_EXPORT, false);
  if (exportDisabled) throw new AccessDeniedError("Bulk export is disabled");

  const { results } = await ctx.db.prepare("SELECT * FROM secrets ORDER BY key").all();
  const allRows = results as SecretRow[];

  // Policy-based access control (same as list/get endpoints)
  const rows = allRows.filter((r) => hasAccess(ctx.auth, SCOPE_READ, r.tags));

  const decrypted = await Promise.all(
    rows.map(async (row): Promise<ExportedSecret> => {
      try {
        const plaintext = await decryptSecretRow(
          row,
          ctx.env.ENCRYPTION_KEY,
          row.key,
          ctx.env.INTEGRITY_KEY,
          { hmacRequired: false },
        );
        return {
          key: row.key,
          value: plaintext,
          description: row.description,
          tags: row.tags,
          expires_at: row.expires_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      } catch (e) {
        const errorMsg =
          e instanceof EncryptionError && e.message.includes("Integrity")
            ? "Integrity check failed"
            : "Decryption failed";
        return {
          key: row.key,
          value: null,
          error: errorMsg,
          description: row.description,
          tags: row.tags,
          expires_at: row.expires_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }
    }),
  );

  await ctx.auditFn(ACTION_EXPORT, null);
  return { secrets: decrypted };
}

// --- Import ---

export type ImportItem = {
  key: string;
  value: string;
  description: string;
  tags: string;
  expires_at: string | null;
};

export async function importSecrets(
  ctx: ServiceContext,
  data: { secrets: ImportItem[]; overwrite: boolean },
): Promise<{ ok: true; imported: number; skipped: number }> {
  if (!hasScope(ctx.auth, SCOPE_WRITE)) throw new AccessDeniedError("Insufficient scope");

  const { secrets: items, overwrite } = data;

  // Policy-based access control: reject items with tags outside caller's policies
  for (const item of items) {
    if (!hasAccess(ctx.auth, SCOPE_WRITE, item.tags ?? ""))
      throw new AccessDeniedError(
        `Access denied - key '${item.key}' ${item.tags ? "has tags outside your role" : "requires tags for your role"}`,
      );
  }

  // Enforce same flag-driven validations as PUT /secrets/{key}
  for (const item of items) {
    try {
      validateSecretInput(ctx.flagCache, item.key, item.value, item.description, item.tags);
    } catch (e) {
      if (e instanceof ValidationError) {
        // Add key context to validation error messages
        throw new ValidationError(`${e.message} (key: '${item.key}')`);
      }
      throw e;
    }
  }

  // Enforce max_secrets limit for net new keys
  const maxSecrets = getFlag(ctx.flagCache, FLAG_MAX_SECRETS, 0) as number;
  if (maxSecrets > 0) {
    const count = await ctx.db
      .prepare("SELECT COUNT(*) as total FROM secrets")
      .first<{ total: number }>();
    const currentTotal = count?.total ?? 0;
    // Count how many items are genuinely new (not overwrites)
    let newCount = 0;
    for (const item of items) {
      const existing = await ctx.db
        .prepare("SELECT key FROM secrets WHERE key = ?")
        .bind(item.key)
        .first();
      if (!existing) newCount++;
    }
    if (currentTotal + newCount > maxSecrets)
      throw new ValidationError(`Import would exceed vault limit of ${maxSecrets} secrets`);
  }

  // First pass: encrypt and check overwrites
  const toInsert: {
    key: string;
    ciphertext: string;
    iv: string;
    hmac: string;
    encrypted_dek: string;
    dek_iv: string;
    description: string;
    tags: string;
    expires_at: string | null;
  }[] = [];
  let skipped = 0;

  for (const item of items) {
    if (!overwrite) {
      const existing = await ctx.db
        .prepare("SELECT key FROM secrets WHERE key = ?")
        .bind(item.key)
        .first();
      if (existing) {
        skipped++;
        continue;
      }
    } else {
      // Check tag access on existing secret before allowing overwrite
      const existing = await ctx.db
        .prepare("SELECT tags FROM secrets WHERE key = ?")
        .bind(item.key)
        .first<{ tags: string }>();
      if (existing && !hasAccess(ctx.auth, SCOPE_WRITE, existing.tags)) {
        throw new AccessDeniedError(
          `Access denied - cannot overwrite '${item.key}' (tags outside your role)`,
        );
      }
    }

    let ciphertext: string;
    let iv: string;
    let encrypted_dek: string;
    let dek_iv: string;
    let hmac: string;
    try {
      ({ ciphertext, iv, encrypted_dek, dek_iv, hmac } = await encryptSecretValue(
        item.value,
        ctx.env.ENCRYPTION_KEY,
        item.key,
        ctx.env.INTEGRITY_KEY,
      ));
    } catch {
      throw new EncryptionError(`Encryption failed for key: ${item.key}`);
    }

    toInsert.push({
      key: item.key,
      ciphertext,
      iv,
      hmac,
      encrypted_dek,
      dek_iv,
      description: item.description,
      tags: item.tags ?? "",
      expires_at: item.expires_at ?? null,
    });
  }

  // Atomic batch insert
  if (toInsert.length > 0) {
    const stmts = toInsert.map((item) =>
      ctx.db
        .prepare(
          `INSERT INTO secrets (key, value, iv, hmac, encrypted_dek, dek_iv, description, tags, expires_at, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, iv = excluded.iv, hmac = excluded.hmac,
           encrypted_dek = excluded.encrypted_dek, dek_iv = excluded.dek_iv,
           description = excluded.description, tags = excluded.tags, expires_at = excluded.expires_at,
           updated_by = excluded.updated_by, updated_at = datetime('now')`,
        )
        .bind(
          item.key,
          item.ciphertext,
          item.iv,
          item.hmac,
          item.encrypted_dek,
          item.dek_iv,
          item.description,
          item.tags,
          item.expires_at,
          ctx.auth.identity,
          ctx.auth.identity,
        ),
    );
    await ctx.db.batch(stmts);
  }

  const imported = toInsert.length;

  await ctx.auditFn(ACTION_IMPORT, null);
  return { ok: true, imported, skipped };
}
