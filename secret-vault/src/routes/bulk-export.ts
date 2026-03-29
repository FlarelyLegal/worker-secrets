import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasAccess, hasScope } from "../auth.js";
import { ACTION_EXPORT, AUTH_INTERACTIVE, FLAG_DISABLE_EXPORT, SCOPE_READ } from "../constants.js";
import { decrypt, envelopeDecrypt, verifyHmac } from "../crypto.js";
import { getFlag } from "../flags.js";
import { R403 } from "../schemas.js";
import { SecretExportItemSchema, type SecretRow } from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const bulkExport = new OpenAPIHono<HonoEnv>();

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

bulkExport.openapi(exportRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE) return c.json({ error: "Owner only" }, 403);
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const exportDisabled = getFlag(c.get("flags"), FLAG_DISABLE_EXPORT, false);
  if (exportDisabled) return c.json({ error: "Bulk export is disabled" }, 403);

  const { results } = await c.env.DB.prepare("SELECT * FROM secrets ORDER BY key").all();
  const allRows = results as SecretRow[];
  // Policy-based access control (same as list/get endpoints)
  const rows = allRows.filter((r) => hasAccess(auth, SCOPE_READ, r.tags));
  const decrypted = await Promise.all(
    rows.map(async (row) => {
      try {
        // Verify HMAC integrity before decryption
        if (row.hmac) {
          const valid = await verifyHmac(
            row.key,
            row.value,
            row.iv,
            row.hmac,
            c.env.ENCRYPTION_KEY,
            c.env.INTEGRITY_KEY,
            row.encrypted_dek,
            row.dek_iv,
          );
          if (!valid)
            return {
              key: row.key,
              value: null,
              error: "Integrity check failed",
              description: row.description,
              tags: row.tags,
              expires_at: row.expires_at,
              created_at: row.created_at,
              updated_at: row.updated_at,
            };
        }
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

export default bulkExport;
