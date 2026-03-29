import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { computeHmac } from "../crypto.js";
import { ErrorSchema, R403, R500 } from "../schemas.js";
import type { SecretRow } from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const rotateKey = new OpenAPIHono<HonoEnv>();

rotateKey.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

// --- Encoding helpers (local, not exported from crypto to avoid coupling) ---

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(b64: string): Uint8Array {
  const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(standard), (ch) => ch.charCodeAt(0));
}

// --- Rotate key ---

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
          schema: z.object({
            ok: z.boolean(),
            rotated: z.number(),
            versions_rotated: z.number(),
            legacy: z.number(),
          }),
        },
      },
      description: "Key rotation results",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    500: R500,
  },
});

rotateKey.openapi(rotateKeyRoute, async (c) => {
  const { new_key } = c.req.valid("json");
  const oldKey = c.env.ENCRYPTION_KEY;

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

  // Rotate secrets
  const { results } = await c.env.DB.prepare("SELECT * FROM secrets").all();
  let rotated = 0;
  let legacy = 0;

  for (const row of results as SecretRow[]) {
    if (!row.encrypted_dek || !row.dek_iv) {
      legacy++;
      continue;
    }

    const dekRaw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(row.dek_iv) },
      oldKek,
      fromBase64url(row.encrypted_dek),
    );

    const newDekIv = crypto.getRandomValues(new Uint8Array(12));
    const newEncryptedDek = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: newDekIv },
      newKek,
      dekRaw,
    );

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

  // Rotate version DEKs
  let versionsRotated = 0;
  const { results: versionResults } = await c.env.DB.prepare(
    "SELECT id, secret_key, value, iv, encrypted_dek, dek_iv FROM secret_versions WHERE encrypted_dek IS NOT NULL",
  ).all();

  type VersionDekRow = {
    id: number;
    secret_key: string;
    value: string;
    iv: string;
    encrypted_dek: string;
    dek_iv: string;
  };
  for (const ver of versionResults as VersionDekRow[]) {
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

export default rotateKey;
