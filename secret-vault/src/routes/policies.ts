import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit } from "../audit.js";
import { ACTION_SET_ROLE } from "../constants.js";
import { ErrorSchema, R403 } from "../schemas.js";
import { PoliciesBody, PolicySchema, RoleNameParam } from "../schemas-rbac.js";
import type { HonoEnv } from "../types.js";

const policies = new OpenAPIHono<HonoEnv>();

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
  const { name } = c.req.valid("param");
  const role = await c.env.DB.prepare("SELECT name FROM roles WHERE name = ?").bind(name).first();
  if (!role) return c.json({ error: "Role not found" }, 404);

  const { results } = await c.env.DB.prepare(
    "SELECT id, role, scopes, tags, description, created_by, created_at FROM role_policies WHERE role = ? ORDER BY id",
  )
    .bind(name)
    .all();
  return c.json({ policies: results as z.infer<typeof PolicySchema>[] }, 200);
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
  const { name } = c.req.valid("param");
  const { policies: policyItems } = c.req.valid("json");

  const role = await c.env.DB.prepare("SELECT name FROM roles WHERE name = ?").bind(name).first();
  if (!role) return c.json({ error: "Role not found" }, 404);

  const identity = c.get("auth").identity;

  // Replace all policies atomically
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare("DELETE FROM role_policies WHERE role = ?").bind(name),
  ];
  for (const p of policyItems) {
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO role_policies (role, scopes, tags, description, created_by) VALUES (?, ?, ?, ?, ?)",
      ).bind(name, p.scopes, p.tags, p.description, identity),
    );
  }
  await c.env.DB.batch(stmts);

  await audit(
    c.env,
    c.get("auth"),
    ACTION_SET_ROLE,
    name,
    c.get("ip"),
    c.get("ua"),
    c.get("requestId"),
  );
  return c.json({ ok: true, count: policyItems.length }, 200);
});

export default policies;
