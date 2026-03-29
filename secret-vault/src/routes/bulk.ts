import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope, hasTagAccess } from "../auth.js";
import {
  ACTION_EXPORT,
  ACTION_IMPORT,
  AUTH_INTERACTIVE,
  FLAG_DISABLE_EXPORT,
  SCOPE_READ,
  SCOPE_WRITE,
} from "../constants.js";
import { computeHmac, decrypt, envelopeDecrypt, envelopeEncrypt } from "../crypto.js";
import { getFlag } from "../flags.js";
import { R403, R500 } from "../schemas.js";
import {
  SecretExportItemSchema,
  SecretImportBody,
  SecretImportResponse,
  type SecretRow,
} from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const bulk = new OpenAPIHono<HonoEnv>();

// --- Export ---

const exportRoute = createRoute({
  method: "get",
  path: "/export",
  tags: ["Secrets"],
  summary: "Export all secrets decrypted (interactive only)",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ secrets: z.array(SecretExportItemSchema) }) },
      },
      description: "All secrets decrypted",
    },
    403: R403,
  },
});

bulk.openapi(exportRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE) return c.json({ error: "Owner only" }, 403);
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const exportDisabled = getFlag(c.get("flags"), FLAG_DISABLE_EXPORT, false);
  if (exportDisabled) return c.json({ error: "Bulk export is disabled" }, 403);

  const { results } = await c.env.DB.prepare("SELECT * FROM secrets ORDER BY key").all();
  const allRows = results as SecretRow[];
  // Filter by tag-based access control (same as list/get endpoints)
  const rows =
    auth.allowedTags.length > 0 ? allRows.filter((r) => hasTagAccess(auth, r.tags)) : allRows;
  const decrypted = await Promise.all(
    rows.map(async (row) => {
      try {
        return {
          key: row.key,
          value:
            row.encrypted_dek && row.dek_iv
              ? await envelopeDecrypt(
                  row.value,
                  row.iv,
                  row.encrypted_dek,
                  row.dek_iv,
                  c.env.ENCRYPTION_KEY,
                )
              : await decrypt(row.value, row.iv, c.env.ENCRYPTION_KEY),
          description: row.description,
          tags: row.tags,
          expires_at: row.expires_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      } catch {
        return {
          key: row.key,
          value: null,
          error: "Decryption failed",
          description: row.description,
          tags: row.tags,
          expires_at: row.expires_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }
    }),
  );
  await audit(c.env, auth, ACTION_EXPORT, null, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ secrets: decrypted }, 200);
});

// --- Import ---

const importRoute = createRoute({
  method: "post",
  path: "/import",
  tags: ["Secrets"],
  summary: "Bulk import secrets from JSON (interactive only)",
  request: {
    body: { content: { "application/json": { schema: SecretImportBody } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SecretImportResponse } },
      description: "Import results",
    },
    403: R403,
    500: R500,
  },
});

bulk.openapi(importRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE) return c.json({ error: "Owner only" }, 403);
  if (!hasScope(auth, SCOPE_WRITE)) return c.json({ error: "Insufficient scope" }, 403);

  const { secrets: items, overwrite } = c.req.valid("json");

  // Tag-based access control: reject items with tags outside caller's allowed_tags
  // For tag-restricted roles, empty/missing tags are also rejected
  if (auth.allowedTags.length > 0) {
    for (const item of items) {
      if (!hasTagAccess(auth, item.tags ?? ""))
        return c.json(
          { error: `Access denied — cannot import key '${item.key}' with tags outside your role` },
          403,
        );
    }
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
  }[] = [];
  let skipped = 0;

  for (const item of items) {
    if (!overwrite) {
      const existing = await c.env.DB.prepare("SELECT key FROM secrets WHERE key = ?")
        .bind(item.key)
        .first();
      if (existing) {
        skipped++;
        continue;
      }
    }
    let ciphertext: string;
    let iv: string;
    let encrypted_dek: string;
    let dek_iv: string;
    try {
      ({ ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
        item.value,
        c.env.ENCRYPTION_KEY,
      ));
    } catch {
      return c.json({ error: `Encryption failed for key: ${item.key}` }, 500);
    }
    const hmac = await computeHmac(
      item.key,
      ciphertext,
      iv,
      c.env.ENCRYPTION_KEY,
      c.env.INTEGRITY_KEY,
      encrypted_dek,
      dek_iv,
    );
    toInsert.push({
      key: item.key,
      ciphertext,
      iv,
      hmac,
      encrypted_dek,
      dek_iv,
      description: item.description,
      tags: item.tags ?? "",
    });
  }

  // Atomic batch insert
  if (toInsert.length > 0) {
    const stmts = toInsert.map((item) =>
      c.env.DB.prepare(
        `INSERT INTO secrets (key, value, iv, hmac, encrypted_dek, dek_iv, description, tags, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, iv = excluded.iv, hmac = excluded.hmac,
           encrypted_dek = excluded.encrypted_dek, dek_iv = excluded.dek_iv,
           description = excluded.description, tags = excluded.tags,
           updated_by = excluded.updated_by, updated_at = datetime('now')`,
      ).bind(
        item.key,
        item.ciphertext,
        item.iv,
        item.hmac,
        item.encrypted_dek,
        item.dek_iv,
        item.description,
        item.tags,
        auth.identity,
        auth.identity,
      ),
    );
    await c.env.DB.batch(stmts);
  }

  const imported = toInsert.length;

  await audit(c.env, auth, ACTION_IMPORT, null, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, imported, skipped }, 200);
});

export default bulk;
