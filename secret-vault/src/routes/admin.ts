import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { AuditEntrySchema, AuditQuery, ErrorSchema, WhoamiSchema } from "../schemas.js";
import type { HonoEnv } from "../types.js";

const admin = new OpenAPIHono<HonoEnv>();

// --- /whoami ---

const whoamiRoute = createRoute({
  method: "get",
  path: "/whoami",
  tags: ["Admin"],
  summary: "Check authentication status",
  responses: {
    200: { content: { "application/json": { schema: WhoamiSchema } }, description: "Auth info" },
  },
});

admin.openapi(whoamiRoute, (c) => {
  const auth = c.get("auth");
  return c.json(
    {
      method: auth.method,
      identity: auth.identity,
      name: auth.name,
      role: auth.role,
      scopes: auth.scopes,
    },
    200,
  );
});

// --- /audit ---

const auditRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["Admin"],
  summary: "View audit log (interactive only)",
  request: { query: AuditQuery },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ entries: z.array(AuditEntrySchema) }) },
      },
      description: "Audit entries",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Owner only",
    },
  },
});

admin.openapi(auditRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== "interactive") return c.json({ error: "Owner only" }, 403);

  const { limit, offset } = c.req.valid("query");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ? OFFSET ?",
  )
    .bind(limit, offset)
    .all();

  return c.json({ entries: results as z.infer<typeof AuditEntrySchema>[] }, 200);
});

export default admin;
