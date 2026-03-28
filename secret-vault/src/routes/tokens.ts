import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit } from "../auth.js";
import {
  ClientIdParam,
  ErrorSchema,
  ServiceTokenSchema,
  TokenCreateBody,
  TokenCreateResponse,
  TokenDeleteResponse,
} from "../schemas.js";
import type { HonoEnv } from "../types.js";

const tokens = new OpenAPIHono<HonoEnv>();

// Interactive-only middleware
tokens.use("*", async (c, next) => {
  if (c.get("auth").method !== "interactive") {
    return c.json({ error: "Owner only" }, 403);
  }
  return next();
});

// --- List ---

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Tokens"],
  summary: "List registered service tokens",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ tokens: z.array(ServiceTokenSchema) }) },
      },
      description: "List of service tokens",
    },
  },
});

tokens.openapi(listRoute, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT client_id, name, description, scopes, created_at, last_used_at FROM service_tokens ORDER BY name",
  ).all();
  await audit(c.env, c.get("auth"), "list_tokens", null, c.get("ip"), c.get("ua"));
  return c.json({ tokens: results as z.infer<typeof ServiceTokenSchema>[] }, 200);
});

// --- Register ---

const VALID_SCOPES = ["*", "read", "write", "delete"];

const registerRoute = createRoute({
  method: "put",
  path: "/{clientId}",
  tags: ["Tokens"],
  summary: "Register a service token",
  request: {
    params: ClientIdParam,
    body: { content: { "application/json": { schema: TokenCreateBody } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: TokenCreateResponse } },
      description: "Token registered",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Invalid input",
    },
  },
});

tokens.openapi(registerRoute, async (c) => {
  const { clientId } = c.req.valid("param");
  const { name, description, scopes } = c.req.valid("json");

  for (const s of scopes.split(",").map((s) => s.trim())) {
    if (!VALID_SCOPES.includes(s)) {
      return c.json({ error: `Invalid scope: ${s}. Valid: ${VALID_SCOPES.join(", ")}` }, 400);
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO service_tokens (client_id, name, description, scopes, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(client_id) DO UPDATE SET
       name = excluded.name, description = excluded.description, scopes = excluded.scopes`,
  )
    .bind(clientId, name, description, scopes)
    .run();

  await audit(c.env, c.get("auth"), "register_token", clientId, c.get("ip"), c.get("ua"));
  return c.json({ ok: true, client_id: clientId, name, scopes }, 201);
});

// --- Revoke ---

const revokeRoute = createRoute({
  method: "delete",
  path: "/{clientId}",
  tags: ["Tokens"],
  summary: "Revoke a service token",
  request: { params: ClientIdParam },
  responses: {
    200: {
      content: { "application/json": { schema: TokenDeleteResponse } },
      description: "Token revoked",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Not found",
    },
  },
});

tokens.openapi(revokeRoute, async (c) => {
  const { clientId } = c.req.valid("param");
  const result = await c.env.DB.prepare("DELETE FROM service_tokens WHERE client_id = ?")
    .bind(clientId)
    .run();

  if (result.meta.changes === 0) return c.json({ error: "Token not found" }, 404);
  await audit(c.env, c.get("auth"), "revoke_token", clientId, c.get("ip"), c.get("ua"));
  return c.json({ ok: true, revoked: clientId }, 200);
});

export default tokens;
