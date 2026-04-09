import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { ErrorSchema, R403 } from "../schemas.js";
import { EmailParam, UserCreateBody, UserSchema, UserUpdateBody } from "../schemas-rbac.js";
import * as usersService from "../services/users.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const users = new OpenAPIHono<HonoEnv>();

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
  const ctx = buildHttpContext(c);
  try {
    const result = await usersService.listUsers(ctx);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
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
  const ctx = buildHttpContext(c);
  try {
    const { email } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await usersService.addUser(ctx, email, body);
    return c.json(result, 201);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400);
    throw e;
  }
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
  const ctx = buildHttpContext(c);
  try {
    const { email } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await usersService.updateUser(ctx, email, body);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400 | 404);
    throw e;
  }
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
  const ctx = buildHttpContext(c);
  try {
    const { email } = c.req.valid("param");
    const result = await usersService.removeUser(ctx, email);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400 | 404);
    throw e;
  }
});

export default users;
