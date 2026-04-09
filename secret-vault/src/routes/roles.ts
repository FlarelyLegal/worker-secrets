import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { ErrorSchema, R403 } from "../schemas.js";
import { RoleCreateBody, RoleNameParam, RoleSchema, RoleUpdateBody } from "../schemas-rbac.js";
import * as rolesService from "../services/roles.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const roles = new OpenAPIHono<HonoEnv>();

// Admin-only middleware
roles.use("*", async (c, next) => {
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
  const ctx = buildHttpContext(c);
  try {
    const result = await rolesService.listRoles(ctx);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
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
  const ctx = buildHttpContext(c);
  try {
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await rolesService.setRole(ctx, name, body);
    return c.json(result, 201);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400);
    throw e;
  }
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
  const ctx = buildHttpContext(c);
  try {
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await rolesService.updateRole(ctx, name, body);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400 | 404);
    throw e;
  }
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
  const ctx = buildHttpContext(c);
  try {
    const { name } = c.req.valid("param");
    const result = await rolesService.deleteRole(ctx, name);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400 | 404);
    throw e;
  }
});

// Policy sub-routes are in policies.ts, mounted via index.ts
export default roles;
