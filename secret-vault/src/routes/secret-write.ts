import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { audit, hasScope, hasTagAccess } from "../auth.js";
import {
  ACTION_SET,
  FLAG_MAX_SECRET_SIZE_KB,
  FLAG_MAX_SECRETS,
  FLAG_MAX_TAGS_PER_SECRET,
  FLAG_MAX_VERSIONS,
  FLAG_REQUIRE_DESCRIPTION,
  FLAG_REQUIRE_TAGS,
  FLAG_SECRET_NAME_PATTERN,
  FLAG_VERSIONING_ENABLED,
  SCOPE_WRITE,
} from "../constants.js";
import { computeHmac, envelopeEncrypt } from "../crypto.js";
import { getFlag } from "../flags.js";
import { ErrorSchema, R403, R500 } from "../schemas.js";
import {
  KeyParam,
  SecretCreateBody,
  SecretCreateResponse,
  type SecretRow,
} from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const secretWrite = new OpenAPIHono<HonoEnv>();

const putRoute = createRoute({
  method: "put",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Create or update a secret",
  request: {
    params: KeyParam,
    body: { content: { "application/json": { schema: SecretCreateBody } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SecretCreateResponse } },
      description: "Secret stored",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    500: R500,
  },
});

secretWrite.openapi(putRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_WRITE)) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const { value, description, tags, expires_at } = c.req.valid("json");

  // Flag-driven input requirements
  if (!description) {
    const reqDesc = getFlag(c.get("flags"), FLAG_REQUIRE_DESCRIPTION, false);
    if (reqDesc) return c.json({ error: "Description is required" }, 400);
  }
  if (!tags) {
    const reqTags = getFlag(c.get("flags"), FLAG_REQUIRE_TAGS, false);
    if (reqTags) return c.json({ error: "Tags are required" }, 400);
  }

  // Secret name pattern enforcement
  const namePattern = getFlag(c.get("flags"), FLAG_SECRET_NAME_PATTERN, "");
  if (namePattern) {
    try {
      if (!new RegExp(namePattern as string).test(key))
        return c.json({ error: `Key does not match required pattern: ${namePattern}` }, 400);
    } catch {
      // Invalid regex in flag — skip enforcement, don't block writes
    }
  }

  // Value size limit
  const maxSizeKb = getFlag(c.get("flags"), FLAG_MAX_SECRET_SIZE_KB, 0);
  if (maxSizeKb > 0 && value.length > (maxSizeKb as number) * 1024)
    return c.json({ error: `Value exceeds ${maxSizeKb}KB limit` }, 400);

  // Tag count limit
  if (tags) {
    const maxTags = getFlag(c.get("flags"), FLAG_MAX_TAGS_PER_SECRET, 0);
    const tagCount = tags.split(",").filter((t) => t.trim()).length;
    if (maxTags > 0 && tagCount > (maxTags as number))
      return c.json({ error: `Too many tags (${tagCount}) — maximum is ${maxTags}` }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();

  // Tag-based access control: check existing secret tags on update
  if (existing && !hasTagAccess(auth, existing.tags))
    return c.json({ error: "Access denied — secret tags do not match your role" }, 403);

  // Tag-based access control: check new tags on create/update
  // For tag-restricted roles, empty/missing tags are rejected — every secret must be tagged
  if (auth.allowedTags.length > 0 && !hasTagAccess(auth, tags || ""))
    return c.json({ error: "Access denied — you cannot assign tags outside your role" }, 403);

  // Enforce max_secrets limit on new keys
  if (!existing) {
    const maxSecrets = getFlag(c.get("flags"), FLAG_MAX_SECRETS, 0);
    if (maxSecrets > 0) {
      const count = await c.env.DB.prepare("SELECT COUNT(*) as total FROM secrets").first<{
        total: number;
      }>();
      if (count && count.total >= maxSecrets)
        return c.json({ error: `Vault limit reached (${maxSecrets} secrets)` }, 400);
    }
  }

  const versioningEnabled = getFlag(c.get("flags"), FLAG_VERSIONING_ENABLED, true);
  if (versioningEnabled && existing) {
    await c.env.DB.prepare(
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
        auth.identity,
      )
      .run();

    const maxVersions = getFlag(c.get("flags"), FLAG_MAX_VERSIONS, 0);
    if (maxVersions > 0) {
      await c.env.DB.prepare(
        `DELETE FROM secret_versions WHERE secret_key = ? AND id NOT IN (
          SELECT id FROM secret_versions WHERE secret_key = ? ORDER BY changed_at DESC LIMIT ?
        )`,
      )
        .bind(key, key, maxVersions)
        .run();
    }
  }

  let ciphertext: string;
  let iv: string;
  let encrypted_dek: string;
  let dek_iv: string;
  try {
    ({ ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
      value,
      c.env.ENCRYPTION_KEY,
    ));
  } catch {
    return c.json({ error: "Encryption failed" }, 500);
  }
  const hmac = await computeHmac(
    key,
    ciphertext,
    iv,
    c.env.ENCRYPTION_KEY,
    c.env.INTEGRITY_KEY,
    encrypted_dek,
    dek_iv,
  );
  const identity = auth.identity;
  await c.env.DB.prepare(
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
  await audit(c.env, auth, ACTION_SET, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, key }, 201);
});

export default secretWrite;
