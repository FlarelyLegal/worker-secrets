import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, isAdmin } from "../auth.js";
import {
  ACTION_ADD_USER,
  ACTION_DELETE_USER,
  ACTION_LIST_USERS,
  ACTION_UPDATE_USER,
  AUTH_INTERACTIVE,
  ROLE_ADMIN,
} from "../constants.js";
import { ErrorSchema, R403 } from "../schemas.js";
import { EmailParam, UserCreateBody, UserSchema, UserUpdateBody } from "../schemas-rbac.js";
import type { HonoEnv } from "../types.js";

const users = new OpenAPIHono<HonoEnv>();

async function adminCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND enabled = 1")
    .first<{ total: number }>();
  return row?.total ?? 0;
}

// Admin-only middleware
users.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

// --- List ---

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Users"],
  summary: "List all users",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ users: z.array(UserSchema) }) } },
      description: "All registered users",
    },
    403: R403,
  },
});

users.openapi(listRoute, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT email, name, role, enabled, age_public_key, last_login_at, created_by, created_at, updated_by, updated_at FROM users ORDER BY email",
  ).all();
  await audit(
    c.env,
    c.get("auth"),
    ACTION_LIST_USERS,
    null,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ users: results as z.infer<typeof UserSchema>[] }, 200);
});

// --- Add ---

const addRoute = createRoute({
  method: "put",
  path: "/{email}",
  tags: ["Users"],
  summary: "Add or update a user",
  request: {
    params: EmailParam,
    body: { content: { "application/json": { schema: UserCreateBody } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ ok: z.boolean(), email: z.string() }) } },
      description: "User added",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
  },
});

users.openapi(addRoute, async (c) => {
  const { email } = c.req.valid("param");
  const { name, role } = c.req.valid("json");

  // Verify role exists
  const roleExists = await c.env.DB.prepare("SELECT name FROM roles WHERE name = ?")
    .bind(role)
    .first();
  if (!roleExists) return c.json({ error: `Role '${role}' does not exist` }, 400);

  // Prevent demoting the last admin via upsert
  const existing = await c.env.DB.prepare("SELECT role, enabled FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ role: string; enabled: number }>();
  if (existing?.role === ROLE_ADMIN && existing.enabled && role !== ROLE_ADMIN) {
    if ((await adminCount(c.env.DB)) <= 1)
      return c.json({ error: "Cannot remove the last admin" }, 400);
  }

  const identity = c.get("auth").identity;
  await c.env.DB.prepare(
    `INSERT INTO users (email, name, role, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       name = excluded.name, role = excluded.role,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
  )
    .bind(email.toLowerCase(), name, role, identity, identity)
    .run();

  await audit(
    c.env,
    c.get("auth"),
    ACTION_ADD_USER,
    email,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ ok: true, email: email.toLowerCase() }, 201);
});

// --- Update (partial) ---

const updateRoute = createRoute({
  method: "patch",
  path: "/{email}",
  tags: ["Users"],
  summary: "Update a user (partial)",
  request: {
    params: EmailParam,
    body: { content: { "application/json": { schema: UserUpdateBody } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ ok: z.boolean(), email: z.string() }) } },
      description: "User updated",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

users.openapi(updateRoute, async (c) => {
  const { email } = c.req.valid("param");
  const body = c.req.valid("json");

  const existing = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first();
  if (!existing) return c.json({ error: "User not found" }, 404);

  if (body.role) {
    const roleExists = await c.env.DB.prepare("SELECT name FROM roles WHERE name = ?")
      .bind(body.role)
      .first();
    if (!roleExists) return c.json({ error: `Role '${body.role}' does not exist` }, 400);
  }

  // Prevent removing the last admin
  const current = await c.env.DB.prepare("SELECT role, enabled FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ role: string; enabled: number }>();
  if (current?.role === ROLE_ADMIN && current.enabled) {
    const wouldLoseAdmin =
      (body.role !== undefined && body.role !== ROLE_ADMIN) || body.enabled === false;
    if (wouldLoseAdmin && (await adminCount(c.env.DB)) <= 1) {
      return c.json({ error: "Cannot remove the last admin" }, 400);
    }
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.name !== undefined) {
    sets.push("name = ?");
    binds.push(body.name);
  }
  if (body.role !== undefined) {
    sets.push("role = ?");
    binds.push(body.role);
  }
  if (body.enabled !== undefined) {
    sets.push("enabled = ?");
    binds.push(body.enabled ? 1 : 0);
  }
  if (body.age_public_key !== undefined) {
    if (body.age_public_key && !body.age_public_key.startsWith("age1"))
      return c.json({ error: "Public key must start with age1" }, 400);
    sets.push("age_public_key = ?");
    binds.push(body.age_public_key);
  }
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);

  sets.push("updated_by = ?", "updated_at = datetime('now')");
  binds.push(c.get("auth").identity, email.toLowerCase());

  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`)
    .bind(...binds)
    .run();

  await audit(
    c.env,
    c.get("auth"),
    ACTION_UPDATE_USER,
    email,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ ok: true, email: email.toLowerCase() }, 200);
});

// --- Delete ---

const deleteRoute = createRoute({
  method: "delete",
  path: "/{email}",
  tags: ["Users"],
  summary: "Remove a user",
  request: { params: EmailParam },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean(), deleted: z.string() }) },
      },
      description: "User removed",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

users.openapi(deleteRoute, async (c) => {
  const { email } = c.req.valid("param");

  // Prevent self-deletion
  if (email.toLowerCase() === c.get("auth").identity.toLowerCase()) {
    return c.json({ error: "Cannot delete yourself" }, 400);
  }

  // Prevent deleting the last admin
  const target = await c.env.DB.prepare("SELECT role, enabled FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ role: string; enabled: number }>();
  if (target?.role === ROLE_ADMIN && target.enabled && (await adminCount(c.env.DB)) <= 1) {
    return c.json({ error: "Cannot delete the last admin" }, 400);
  }

  const result = await c.env.DB.prepare("DELETE FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .run();
  if (result.meta.changes === 0) return c.json({ error: "User not found" }, 404);

  await audit(
    c.env,
    c.get("auth"),
    ACTION_DELETE_USER,
    email,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ ok: true, deleted: email.toLowerCase() }, 200);
});

export default users;
