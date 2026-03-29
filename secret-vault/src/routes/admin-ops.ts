import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { computeHmac, decrypt, envelopeEncrypt } from "../crypto.js";
import { ErrorSchema, R403, R500 } from "../schemas.js";
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
    // Skip secrets already using envelope encryption
    if (row.encrypted_dek && row.dek_iv) {
      skipped++;
      continue;
    }

    // Decrypt with legacy direct encryption
    let plaintext: string;
    try {
      plaintext = await decrypt(row.value, row.iv, c.env.ENCRYPTION_KEY);
    } catch {
      skipped++;
      continue;
    }

    // Re-encrypt with envelope encryption
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

// --- Rotate key ---
// Re-wraps all DEKs with a new master KEK. Secret data is never decrypted.

const rotateKeyRoute = createRoute({
  method: "post",
  path: "/rotate-key",
  tags: ["Admin"],
  summary: "Re-wrap all DEKs with a new master key (admin only)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            new_key: z.string().regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex characters (32 bytes)"),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean(), rotated: z.number(), legacy: z.number() }),
        },
      },
      description: "Key rotation results",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    500: R500,
  },
});

adminOps.openapi(rotateKeyRoute, async (c) => {
  const { new_key } = c.req.valid("json");
  const oldKey = c.env.ENCRYPTION_KEY;

  const { results } = await c.env.DB.prepare("SELECT * FROM secrets").all();
  const rows = results as SecretRow[];

  let rotated = 0;
  let legacy = 0;

  // Import old and new KEKs
  const hexToBytes = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  };
  const toBase64url = (buf: ArrayBuffer | Uint8Array) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromBase64url = (b64: string) => {
    const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(standard), (ch) => ch.charCodeAt(0));
  };

  const oldKek = await crypto.subtle.importKey(
    "raw",
    hexToBytes(oldKey).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const newKek = await crypto.subtle.importKey(
    "raw",
    hexToBytes(new_key).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt"],
  );

  for (const row of rows) {
    if (!row.encrypted_dek || !row.dek_iv) {
      legacy++;
      continue;
    }

    // Decrypt DEK with old KEK
    const dekRaw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(row.dek_iv) },
      oldKek,
      fromBase64url(row.encrypted_dek),
    );

    // Re-encrypt DEK with new KEK
    const newDekIv = crypto.getRandomValues(new Uint8Array(12));
    const newEncryptedDek = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: newDekIv },
      newKek,
      dekRaw,
    );

    // Recompute HMAC with new key
    const newDekB64 = toBase64url(newEncryptedDek);
    const newDekIvB64 = toBase64url(newDekIv);
    const hmac = await computeHmac(
      row.key,
      row.value,
      row.iv,
      new_key,
      c.env.INTEGRITY_KEY,
      newDekB64,
      newDekIvB64,
    );

    await c.env.DB.prepare(
      "UPDATE secrets SET encrypted_dek = ?, dek_iv = ?, hmac = ?, updated_at = datetime('now') WHERE key = ?",
    )
      .bind(newDekB64, newDekIvB64, hmac, row.key)
      .run();

    rotated++;
  }

  // Also rotate DEKs in version history
  let versionsRotated = 0;
  const { results: versionResults } = await c.env.DB.prepare(
    "SELECT id, secret_key, value, iv, encrypted_dek, dek_iv FROM secret_versions WHERE encrypted_dek IS NOT NULL",
  ).all();

  for (const ver of versionResults as {
    id: number;
    secret_key: string;
    value: string;
    iv: string;
    encrypted_dek: string;
    dek_iv: string;
  }[]) {
    const vDekRaw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(ver.dek_iv) },
      oldKek,
      fromBase64url(ver.encrypted_dek),
    );
    const vNewDekIv = crypto.getRandomValues(new Uint8Array(12));
    const vNewEncDek = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: vNewDekIv },
      newKek,
      vDekRaw,
    );
    const vDekB64 = toBase64url(vNewEncDek);
    const vDekIvB64 = toBase64url(vNewDekIv);
    const vHmac = await computeHmac(
      ver.secret_key,
      ver.value,
      ver.iv,
      new_key,
      c.env.INTEGRITY_KEY,
      vDekB64,
      vDekIvB64,
    );
    await c.env.DB.prepare(
      "UPDATE secret_versions SET encrypted_dek = ?, dek_iv = ?, hmac = ? WHERE id = ?",
    )
      .bind(vDekB64, vDekIvB64, vHmac, ver.id)
      .run();
    versionsRotated++;
  }

  await audit(
    c.env,
    c.get("auth"),
    "rotate_key",
    null,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );

  return c.json({ ok: true, rotated, versions_rotated: versionsRotated, legacy }, 200);
});

export default adminOps;
