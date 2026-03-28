import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope } from "../auth.js";
import { decrypt, encrypt } from "../crypto.js";
import {
  ErrorSchema,
  KeyParam,
  R403,
  R500,
  SecretCreateBody,
  SecretCreateResponse,
  SecretDeleteResponse,
  SecretEntrySchema,
  SecretListItemSchema,
  type SecretRow,
} from "../schemas.js";
import type { HonoEnv } from "../types.js";

const secrets = new OpenAPIHono<HonoEnv>();

// --- List ---

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Secrets"],
  summary: "List all secret keys (no values)",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ secrets: z.array(SecretListItemSchema) }) },
      },
      description: "List of secrets",
    },
    403: R403,
  },
});

secrets.openapi(listRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, "read")) return c.json({ error: "Insufficient scope" }, 403);

  const { results } = await c.env.DB.prepare(
    "SELECT key, description, created_at, updated_at FROM secrets ORDER BY key",
  ).all();
  await audit(c.env, auth, "list", null, c.get("ip"), c.get("ua"));
  return c.json({ secrets: results as z.infer<typeof SecretListItemSchema>[] }, 200);
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
  if (!hasScope(auth, "read")) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const row = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();

  if (!row) return c.json({ error: "Secret not found" }, 404);

  let plaintext: string;
  try {
    plaintext = await decrypt(row.value, row.iv, c.env.ENCRYPTION_KEY);
  } catch {
    return c.json({ error: "Decryption failed" }, 500);
  }
  await audit(c.env, auth, "get", key, c.get("ip"), c.get("ua"));
  return c.json(
    {
      key: row.key,
      value: plaintext,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
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
  if (!hasScope(auth, "write")) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const { value, description } = c.req.valid("json");

  let ciphertext: string;
  let iv: string;
  try {
    ({ ciphertext, iv } = await encrypt(value, c.env.ENCRYPTION_KEY));
  } catch {
    return c.json({ error: "Encryption failed" }, 500);
  }

  const identity = auth.identity;
  await c.env.DB.prepare(
    `INSERT INTO secrets (key, value, iv, description, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, iv = excluded.iv,
       description = excluded.description, updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
  )
    .bind(key, ciphertext, iv, description, identity, identity)
    .run();

  await audit(c.env, auth, "set", key, c.get("ip"), c.get("ua"));
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
  if (!hasScope(auth, "delete")) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const result = await c.env.DB.prepare("DELETE FROM secrets WHERE key = ?").bind(key).run();

  if (result.meta.changes === 0) return c.json({ error: "Secret not found" }, 404);
  await audit(c.env, auth, "delete", key, c.get("ip"), c.get("ua"));
  return c.json({ ok: true, deleted: key }, 200);
});

export default secrets;
