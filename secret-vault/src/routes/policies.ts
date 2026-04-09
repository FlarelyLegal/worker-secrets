import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { ErrorSchema, R403 } from "../schemas.js";
import { PoliciesBody, PolicySchema, RoleNameParam } from "../schemas-rbac.js";
import * as policiesService from "../services/policies.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const policies = new OpenAPIHono<HonoEnv>();

// Admin-only guard - policies control RBAC, must be restricted
policies.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

// --- List policies ---

const listPoliciesRoute = createRoute({
  method: "get",
  path: "/{name}/policies",
  tags: ["Roles"],
  summary: "List policies for a role",
  request: { params: RoleNameParam },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ policies: z.array(PolicySchema) }) } },
      description: "Policies for the role",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

policies.openapi(listPoliciesRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { name } = c.req.valid("param");
    const result = await policiesService.listPolicies(ctx, name);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 404);
    throw e;
  }
});

// --- Set policies ---

const setPoliciesRoute = createRoute({
  method: "put",
  path: "/{name}/policies",
  tags: ["Roles"],
  summary: "Replace all policies for a role",
  request: {
    params: RoleNameParam,
    body: { content: { "application/json": { schema: PoliciesBody } }, required: true },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean(), count: z.number() }) },
      },
      description: "Policies replaced",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

policies.openapi(setPoliciesRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { name } = c.req.valid("param");
    const { policies: policyItems } = c.req.valid("json");
    const result = await policiesService.setPolicies(ctx, name, policyItems);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 404);
    throw e;
  }
});

export default policies;
