import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope } from "../auth.js";
import { ErrorSchema, R403 } from "../schemas.js";
import { KeyParam } from "../schemas-secrets.js";
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

export default versions;
