import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
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
  summary: "View audit log (admin only)",
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
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth))
    return c.json({ error: "Admin only" }, 403);

  const { limit, offset, identity, action, key, method, from, to } = c.req.valid("query");
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (identity) {
    conditions.push("identity = ?");
    binds.push(identity);
  }
  if (action) {
    conditions.push("action = ?");
    binds.push(action);
  }
  if (key) {
    conditions.push("secret_key = ?");
    binds.push(key);
  }
  if (method) {
    conditions.push("method = ?");
    binds.push(method);
  }
  if (from) {
    conditions.push("timestamp >= ?");
    binds.push(from);
  }
  if (to) {
    conditions.push("timestamp <= ?");
    binds.push(to);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM audit_log${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds, limit, offset)
    .all();

  return c.json({ entries: results as z.infer<typeof AuditEntrySchema>[] }, 200);
});

export default admin;
