import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, isAdmin } from "../auth.js";
import { ErrorSchema, R403 } from "../schemas.js";
import { RoleCreateBody, RoleNameParam, RoleSchema, RoleUpdateBody } from "../schemas-rbac.js";
import type { HonoEnv } from "../types.js";

const roles = new OpenAPIHono<HonoEnv>();

// Admin-only middleware
roles.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== "interactive" || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

// --- List ---

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Roles"],
  summary: "List all roles",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ roles: z.array(RoleSchema) }) } },
      description: "All roles with scopes",
    },
    403: R403,
  },
});

roles.openapi(listRoute, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT name, scopes, description, created_by, created_at, updated_by, updated_at FROM roles ORDER BY name",
  ).all();
  await audit(
    c.env,
    c.get("auth"),
    "list_roles",
    null,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ roles: results as z.infer<typeof RoleSchema>[] }, 200);
});

// --- Create ---

const createRoleRoute = createRoute({
  method: "put",
  path: "/{name}",
  tags: ["Roles"],
  summary: "Create or update a role",
  request: {
    params: RoleNameParam,
    body: { content: { "application/json": { schema: RoleCreateBody } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ ok: z.boolean(), name: z.string() }) } },
      description: "Role created or updated",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
  },
});

roles.openapi(createRoleRoute, async (c) => {
  const { name } = c.req.valid("param");
  const { scopes, description } = c.req.valid("json");
  const identity = c.get("auth").identity;

  await c.env.DB.prepare(
    `INSERT INTO roles (name, scopes, description, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       scopes = excluded.scopes, description = excluded.description,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
  )
    .bind(name, scopes, description, identity, identity)
    .run();

  await audit(c.env, c.get("auth"), "set_role", name, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, name }, 201);
});

// --- Update (partial) ---

const updateRoute = createRoute({
  method: "patch",
  path: "/{name}",
  tags: ["Roles"],
  summary: "Update a role (partial)",
  request: {
    params: RoleNameParam,
    body: { content: { "application/json": { schema: RoleUpdateBody } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ ok: z.boolean(), name: z.string() }) } },
      description: "Role updated",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

roles.openapi(updateRoute, async (c) => {
  const { name } = c.req.valid("param");
  const body = c.req.valid("json");

  const existing = await c.env.DB.prepare("SELECT name FROM roles WHERE name = ?")
    .bind(name)
    .first();
  if (!existing) return c.json({ error: "Role not found" }, 404);

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.scopes !== undefined) {
    sets.push("scopes = ?");
    binds.push(body.scopes);
  }
  if (body.description !== undefined) {
    sets.push("description = ?");
    binds.push(body.description);
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);

  sets.push("updated_by = ?", "updated_at = datetime('now')");
  binds.push(c.get("auth").identity, name);

  await c.env.DB.prepare(`UPDATE roles SET ${sets.join(", ")} WHERE name = ?`)
    .bind(...binds)
    .run();

  await audit(
    c.env,
    c.get("auth"),
    "update_role",
    name,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ ok: true, name }, 200);
});

// --- Delete ---

const deleteRoute = createRoute({
  method: "delete",
  path: "/{name}",
  tags: ["Roles"],
  summary: "Delete a role",
  request: { params: RoleNameParam },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean(), deleted: z.string() }) },
      },
      description: "Role deleted",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Role in use" },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

roles.openapi(deleteRoute, async (c) => {
  const { name } = c.req.valid("param");

  // Prevent deleting roles that have users assigned
  const usersWithRole = await c.env.DB.prepare("SELECT COUNT(*) as total FROM users WHERE role = ?")
    .bind(name)
    .first<{ total: number }>();
  if (usersWithRole && usersWithRole.total > 0) {
    return c.json(
      { error: `Cannot delete role '${name}' — ${usersWithRole.total} user(s) assigned` },
      400,
    );
  }

  // Also check service tokens
  const tokensWithRole = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM service_tokens WHERE role = ?",
  )
    .bind(name)
    .first<{ total: number }>();
  if (tokensWithRole && tokensWithRole.total > 0) {
    return c.json(
      { error: `Cannot delete role '${name}' — ${tokensWithRole.total} token(s) assigned` },
      400,
    );
  }

  const result = await c.env.DB.prepare("DELETE FROM roles WHERE name = ?").bind(name).run();
  if (result.meta.changes === 0) return c.json({ error: "Role not found" }, 404);

  await audit(
    c.env,
    c.get("auth"),
    "delete_role",
    name,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ ok: true, deleted: name }, 200);
});

export default roles;
