import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope } from "../auth.js";
import { computeHmac, decrypt, encrypt } from "../crypto.js";
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
  if (auth.method !== "interactive") return c.json({ error: "Owner only" }, 403);
  if (!hasScope(auth, "read")) return c.json({ error: "Insufficient scope" }, 403);

  const { results } = await c.env.DB.prepare("SELECT * FROM secrets ORDER BY key").all();
  const rows = results as SecretRow[];
  const decrypted = await Promise.all(
    rows.map(async (row) => {
      try {
        return {
          key: row.key,
          value: await decrypt(row.value, row.iv, c.env.ENCRYPTION_KEY),
          description: row.description,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      } catch {
        return {
          key: row.key,
          value: null,
          error: "Decryption failed",
          description: row.description,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }
    }),
  );
  await audit(c.env, auth, "export", null, c.get("ip"), c.get("ua"), c.get("requestId"));
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
  if (auth.method !== "interactive") return c.json({ error: "Owner only" }, 403);
  if (!hasScope(auth, "write")) return c.json({ error: "Insufficient scope" }, 403);

  const { secrets: items, overwrite } = c.req.valid("json");

  // First pass: encrypt and check overwrites
  const toInsert: {
    key: string;
    ciphertext: string;
    iv: string;
    hmac: string;
    description: string;
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
    try {
      ({ ciphertext, iv } = await encrypt(item.value, c.env.ENCRYPTION_KEY));
    } catch {
      return c.json({ error: `Encryption failed for key: ${item.key}` }, 500);
    }
    const hmac = await computeHmac(item.key, ciphertext, iv, c.env.ENCRYPTION_KEY);
    toInsert.push({ key: item.key, ciphertext, iv, hmac, description: item.description });
  }

  // Atomic batch insert
  if (toInsert.length > 0) {
    const stmts = toInsert.map((item) =>
      c.env.DB.prepare(
        `INSERT INTO secrets (key, value, iv, hmac, description, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, iv = excluded.iv, hmac = excluded.hmac,
           description = excluded.description, updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      ).bind(
        item.key,
        item.ciphertext,
        item.iv,
        item.hmac,
        item.description,
        auth.identity,
        auth.identity,
      ),
    );
    await c.env.DB.batch(stmts);
  }

  const imported = toInsert.length;

  await audit(c.env, auth, "import", null, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, imported, skipped }, 200);
});

export default bulk;
