import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { computeHmac, decrypt, envelopeEncrypt } from "../crypto.js";
import { R403, R500 } from "../schemas.js";
import type { SecretRow } from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const adminOps = new OpenAPIHono<HonoEnv>();

// Admin-only middleware
adminOps.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

// --- Re-encrypt ---
// Migrates legacy (direct-encrypted) secrets to envelope encryption.

const reencryptRoute = createRoute({
  method: "post",
  path: "/re-encrypt",
  tags: ["Admin"],
  summary: "Re-encrypt legacy secrets with envelope encryption (admin only)",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean(), migrated: z.number(), skipped: z.number() }),
        },
      },
      description: "Re-encryption results",
    },
    403: R403,
    500: R500,
  },
});

adminOps.openapi(reencryptRoute, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM secrets").all();
  const rows = results as SecretRow[];

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.encrypted_dek && row.dek_iv) {
      skipped++;
      continue;
    }

    let plaintext: string;
    try {
      plaintext = await decrypt(row.value, row.iv, c.env.ENCRYPTION_KEY);
    } catch {
      skipped++;
      continue;
    }

    const { ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
      plaintext,
      c.env.ENCRYPTION_KEY,
    );
    const hmac = await computeHmac(
      row.key,
      ciphertext,
      iv,
      c.env.ENCRYPTION_KEY,
      c.env.INTEGRITY_KEY,
      encrypted_dek,
      dek_iv,
    );

    await c.env.DB.prepare(
      "UPDATE secrets SET value = ?, iv = ?, hmac = ?, encrypted_dek = ?, dek_iv = ?, updated_at = datetime('now') WHERE key = ?",
    )
      .bind(ciphertext, iv, hmac, encrypted_dek, dek_iv, row.key)
      .run();

    migrated++;
  }

  await audit(
    c.env,
    c.get("auth"),
    "re_encrypt",
    null,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ ok: true, migrated, skipped }, 200);
});

export default adminOps;
