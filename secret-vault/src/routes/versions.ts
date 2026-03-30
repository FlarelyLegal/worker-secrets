import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasAccess, hasScope } from "../auth.js";
import {
  ACTION_GET,
  ACTION_RESTORE,
  ACTION_VERSIONS,
  FLAG_HMAC_REQUIRED,
  SCOPE_READ,
  SCOPE_WRITE,
} from "../constants.js";
import { decrypt, envelopeDecrypt, verifyHmac } from "../crypto.js";
import { getFlag } from "../flags.js";
import { ErrorSchema, R403, R500 } from "../schemas.js";
import { KeyParam, type SecretRow } from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const versions = new OpenAPIHono<HonoEnv>();

const VersionItemSchema = z.object({
  id: z.number(),
  changed_by: z.string(),
  changed_at: z.string(),
});

const versionsRoute = createRoute({
  method: "get",
  path: "/{key}/versions",
  tags: ["Secrets"],
  summary: "List version history for a secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ versions: z.array(VersionItemSchema) }) },
      },
      description: "Version history (values not included for security)",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

versions.openapi(versionsRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");

  // Tag-based access control
  const secret = await c.env.DB.prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (!secret) return c.json({ error: "Secret not found" }, 404);
  if (!hasAccess(auth, SCOPE_READ, secret.tags))
    return c.json({ error: "Access denied - secret tags do not match your role" }, 403);

  const { results } = await c.env.DB.prepare(
    "SELECT id, changed_by, changed_at FROM secret_versions WHERE secret_key = ? ORDER BY changed_at DESC",
  )
    .bind(key)
    .all();
  await audit(c.env, auth, ACTION_VERSIONS, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ versions: results }, 200);
});

// --- Get version value ---

const getVersionRoute = createRoute({
  method: "get",
  path: "/{key}/versions/{id}",
  tags: ["Secrets"],
  summary: "Get a decrypted version value",
  request: {
    params: z.object({
      key: z
        .string()
        .min(1)
        .openapi({ param: { name: "key", in: "path" }, example: "api-key" }),
      id: z.coerce
        .number()
        .int()
        .min(1)
        .openapi({ param: { name: "id", in: "path" }, example: 1 }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number(),
            key: z.string(),
            value: z.string(),
            description: z.string(),
            changed_by: z.string(),
            changed_at: z.string(),
          }),
        },
      },
      description: "Decrypted version value",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    500: R500,
  },
});

versions.openapi(getVersionRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const { key, id } = c.req.valid("param");

  // Tag-based access control
  const secret = await c.env.DB.prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (!secret) return c.json({ error: "Secret not found" }, 404);
  if (!hasAccess(auth, SCOPE_READ, secret.tags))
    return c.json({ error: "Access denied - secret tags do not match your role" }, 403);

  const version = await c.env.DB.prepare(
    "SELECT id, secret_key, value, iv, encrypted_dek, dek_iv, description, changed_by, changed_at FROM secret_versions WHERE id = ? AND secret_key = ?",
  )
    .bind(id, key)
    .first<VersionRow>();
  if (!version) return c.json({ error: "Version not found" }, 404);

  // Verify HMAC integrity (same checks as GET /secrets/{key})
  if (version.hmac) {
    const valid = await verifyHmac(
      key,
      version.value,
      version.iv,
      version.hmac,
      c.env.ENCRYPTION_KEY,
      c.env.INTEGRITY_KEY,
      version.encrypted_dek,
      version.dek_iv,
    );
    if (!valid)
      return c.json({ error: "Integrity check failed - version may have been tampered with" }, 500);
  } else {
    const hmacRequired = getFlag(c.get("flags"), FLAG_HMAC_REQUIRED, false);
    if (hmacRequired)
      return c.json({ error: "Version missing HMAC integrity tag - re-save to add one" }, 500);
  }

  let plaintext: string;
  try {
    if (version.encrypted_dek && version.dek_iv) {
      plaintext = await envelopeDecrypt(
        version.value,
        version.iv,
        version.encrypted_dek,
        version.dek_iv,
        c.env.ENCRYPTION_KEY,
        key,
      );
    } else {
      plaintext = await decrypt(version.value, version.iv, c.env.ENCRYPTION_KEY, key);
    }
  } catch {
    return c.json({ error: "Decryption failed" }, 500);
  }

  await audit(c.env, auth, ACTION_GET, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json(
    {
      id: version.id,
      key,
      value: plaintext,
      description: version.description,
      changed_by: version.changed_by,
      changed_at: version.changed_at as string,
    },
    200,
  );
});

// --- Restore ---

const VersionIdParam = z.object({
  key: z
    .string()
    .min(1)
    .openapi({ param: { name: "key", in: "path" }, example: "api-key" }),
  id: z.coerce
    .number()
    .int()
    .min(1)
    .openapi({ param: { name: "id", in: "path" }, example: 1 }),
});

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

const restoreRoute = createRoute({
  method: "post",
  path: "/{key}/versions/{id}/restore",
  tags: ["Secrets"],
  summary: "Restore a secret to a previous version",
  request: { params: VersionIdParam },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean(), key: z.string(), restored_from: z.number() }),
        },
      },
      description: "Secret restored",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    500: R500,
  },
});

versions.openapi(restoreRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_WRITE)) return c.json({ error: "Insufficient scope" }, 403);

  const { key, id } = c.req.valid("param");

  // Tag-based access control
  const secret = await c.env.DB.prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (secret && !hasAccess(auth, SCOPE_WRITE, secret.tags))
    return c.json({ error: "Access denied - secret tags do not match your role" }, 403);

  // Fetch the version to restore
  const version = await c.env.DB.prepare(
    "SELECT id, secret_key, value, iv, hmac, encrypted_dek, dek_iv, description FROM secret_versions WHERE id = ? AND secret_key = ?",
  )
    .bind(id, key)
    .first<VersionRow>();
  if (!version) return c.json({ error: "Version not found" }, 404);

  // Verify HMAC integrity of the version being restored
  if (version.hmac) {
    const valid = await verifyHmac(
      key,
      version.value,
      version.iv,
      version.hmac,
      c.env.ENCRYPTION_KEY,
      c.env.INTEGRITY_KEY,
      version.encrypted_dek,
      version.dek_iv,
    );
    if (!valid)
      return c.json(
        {
          error:
            "Integrity check failed - version may have been tampered with, refusing to restore",
        },
        500,
      );
  }

  // Save current value as a new version before overwriting
  const current = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();
  if (!current) return c.json({ error: "Secret not found" }, 404);

  await c.env.DB.batch([
    // Archive current value (including DEK columns)
    c.env.DB.prepare(
      "INSERT INTO secret_versions (secret_key, value, iv, hmac, encrypted_dek, dek_iv, description, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      key,
      current.value,
      current.iv,
      current.hmac,
      current.encrypted_dek,
      current.dek_iv,
      current.description,
      auth.identity,
    ),
    // Restore old version (including DEK columns)
    c.env.DB.prepare(
      "UPDATE secrets SET value = ?, iv = ?, hmac = ?, encrypted_dek = ?, dek_iv = ?, description = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?",
    ).bind(
      version.value,
      version.iv,
      version.hmac,
      version.encrypted_dek,
      version.dek_iv,
      version.description,
      auth.identity,
      key,
    ),
  ]);

  await audit(c.env, auth, ACTION_RESTORE, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, key, restored_from: id }, 200);
});

export default versions;
