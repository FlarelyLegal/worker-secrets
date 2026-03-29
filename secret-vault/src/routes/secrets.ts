import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope } from "../auth.js";
import {
  ACTION_DELETE,
  ACTION_GET,
  ACTION_LIST,
  ACTION_SET,
  FLAG_HMAC_REQUIRED,
  FLAG_MAX_SECRETS,
  FLAG_MAX_VERSIONS,
  FLAG_REQUIRE_DESCRIPTION,
  FLAG_REQUIRE_TAGS,
  FLAG_VERSIONING_ENABLED,
  SCOPE_DELETE,
  SCOPE_READ,
  SCOPE_WRITE,
} from "../constants.js";
import { computeHmac, decrypt, encrypt, verifyHmac } from "../crypto.js";
import { getFlag } from "../flags.js";
import { ErrorSchema, PaginationQuery, R403, R500 } from "../schemas.js";
import {
  KeyParam,
  SecretCreateBody,
  SecretCreateResponse,
  SecretDeleteResponse,
  SecretEntrySchema,
  SecretListItemSchema,
  type SecretRow,
} from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const secrets = new OpenAPIHono<HonoEnv>();

// --- List ---
const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Secrets"],
  summary: "List secret keys (no values)",
  request: { query: PaginationQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            secrets: z.array(SecretListItemSchema),
            total: z.number(),
          }),
        },
      },
      description: "Paginated list of secrets",
    },
    403: R403,
  },
});

secrets.openapi(listRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const { limit, offset, search } = c.req.valid("query");
  let countSql = "SELECT COUNT(*) as total FROM secrets";
  let listSql =
    "SELECT key, description, tags, expires_at, created_by, updated_by, created_at, updated_at FROM secrets";
  const binds: unknown[] = [];

  if (search) {
    const where = " WHERE key LIKE ?";
    countSql += where;
    listSql += where;
    binds.push(`%${search}%`);
  }

  listSql += " ORDER BY key LIMIT ? OFFSET ?";
  const { results: countResult } = await c.env.DB.prepare(countSql)
    .bind(...binds)
    .all();
  const total = (countResult[0] as { total: number }).total;
  const { results } = await c.env.DB.prepare(listSql)
    .bind(...binds, limit, offset)
    .all();
  await audit(c.env, auth, ACTION_LIST, null, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ secrets: results as z.infer<typeof SecretListItemSchema>[], total }, 200);
});

// --- Get ---
const getRoute = createRoute({
  method: "get",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Get a decrypted secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: { "application/json": { schema: SecretEntrySchema } },
      description: "Decrypted secret",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    500: R500,
  },
});

secrets.openapi(getRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const row = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();

  if (!row) return c.json({ error: "Secret not found" }, 404);

  // Verify HMAC integrity
  if (row.hmac) {
    const valid = await verifyHmac(key, row.value, row.iv, row.hmac, c.env.ENCRYPTION_KEY);
    if (!valid)
      return c.json({ error: "Integrity check failed — secret may have been tampered with" }, 500);
  } else {
    const hmacRequired = getFlag(c.get("flags"), FLAG_HMAC_REQUIRED, false);
    if (hmacRequired)
      return c.json({ error: "Secret missing HMAC integrity tag — re-save to add one" }, 500);
  }

  let plaintext: string;
  try {
    plaintext = await decrypt(row.value, row.iv, c.env.ENCRYPTION_KEY);
  } catch {
    return c.json({ error: "Decryption failed" }, 500);
  }
  await audit(c.env, auth, ACTION_GET, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  const {
    key: k,
    description,
    tags,
    expires_at,
    created_by,
    updated_by,
    created_at,
    updated_at,
  } = row;
  return c.json(
    {
      key: k,
      value: plaintext,
      description,
      tags,
      expires_at,
      created_by,
      updated_by,
      created_at,
      updated_at,
    },
    200,
  );
});

// --- Put ---

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

secrets.openapi(putRoute, async (c) => {
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

  const existing = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();

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
      "INSERT INTO secret_versions (secret_key, value, iv, hmac, description, changed_by) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(key, existing.value, existing.iv, existing.hmac, existing.description, auth.identity)
      .run();

    // Prune old versions if max_versions is set
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
  try {
    ({ ciphertext, iv } = await encrypt(value, c.env.ENCRYPTION_KEY));
  } catch {
    return c.json({ error: "Encryption failed" }, 500);
  }
  const hmac = await computeHmac(key, ciphertext, iv, c.env.ENCRYPTION_KEY);
  const identity = auth.identity;
  await c.env.DB.prepare(
    `INSERT INTO secrets (key, value, iv, hmac, description, tags, expires_at, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, iv = excluded.iv, hmac = excluded.hmac,
       description = excluded.description, tags = excluded.tags,
       expires_at = excluded.expires_at,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
  )
    .bind(key, ciphertext, iv, hmac, description, tags, expires_at, identity, identity)
    .run();
  await audit(c.env, auth, ACTION_SET, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, key }, 201);
});

// --- Delete ---

const deleteRoute = createRoute({
  method: "delete",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Delete a secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: { "application/json": { schema: SecretDeleteResponse } },
      description: "Deleted",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

secrets.openapi(deleteRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_DELETE)) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const result = await c.env.DB.prepare("DELETE FROM secrets WHERE key = ?").bind(key).run();
  if (result.meta.changes === 0) return c.json({ error: "Secret not found" }, 404);
  await audit(c.env, auth, ACTION_DELETE, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, deleted: key }, 200);
});

export default secrets;
