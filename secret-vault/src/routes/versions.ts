import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope } from "../auth.js";
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
  if (!hasScope(auth, "read")) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const { results } = await c.env.DB.prepare(
    "SELECT id, changed_by, changed_at FROM secret_versions WHERE secret_key = ? ORDER BY changed_at DESC",
  )
    .bind(key)
    .all();
  if (results.length === 0) {
    const exists = await c.env.DB.prepare("SELECT key FROM secrets WHERE key = ?")
      .bind(key)
      .first();
    if (!exists) return c.json({ error: "Secret not found" }, 404);
  }
  await audit(c.env, auth, "versions", key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ versions: results }, 200);
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
  description: string;
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
  if (!hasScope(auth, "write")) return c.json({ error: "Insufficient scope" }, 403);

  const { key, id } = c.req.valid("param");

  // Fetch the version to restore
  const version = await c.env.DB.prepare(
    "SELECT id, secret_key, value, iv, hmac, description FROM secret_versions WHERE id = ? AND secret_key = ?",
  )
    .bind(id, key)
    .first<VersionRow>();
  if (!version) return c.json({ error: "Version not found" }, 404);

  // Save current value as a new version before overwriting
  const current = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();
  if (!current) return c.json({ error: "Secret not found" }, 404);

  await c.env.DB.batch([
    // Archive current value
    c.env.DB.prepare(
      "INSERT INTO secret_versions (secret_key, value, iv, hmac, description, changed_by) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(key, current.value, current.iv, current.hmac, current.description, auth.identity),
    // Restore old version
    c.env.DB.prepare(
      "UPDATE secrets SET value = ?, iv = ?, hmac = ?, description = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?",
    ).bind(version.value, version.iv, version.hmac, version.description, auth.identity, key),
  ]);

  await audit(c.env, auth, "restore", key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, key, restored_from: id }, 200);
});

export default versions;
