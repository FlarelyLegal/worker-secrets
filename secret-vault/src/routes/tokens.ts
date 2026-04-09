import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { ErrorSchema } from "../schemas.js";
import {
  ClientIdParam,
  ServiceTokenSchema,
  TokenCreateBody,
  TokenCreateResponse,
  TokenDeleteResponse,
} from "../schemas-tokens.js";
import * as tokensService from "../services/tokens.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const tokens = new OpenAPIHono<HonoEnv>();

// Admin-only middleware
tokens.use("*", async (c, next) => {
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
  const ctx = buildHttpContext(c);
  try {
    const result = await tokensService.listTokens(ctx);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

// --- Register ---

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
  const ctx = buildHttpContext(c);
  try {
    const { clientId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await tokensService.registerToken(ctx, clientId, body);
    return c.json(result, 201);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400);
    throw e;
  }
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
  const ctx = buildHttpContext(c);
  try {
    const { clientId } = c.req.valid("param");
    const result = await tokensService.revokeToken(ctx, clientId);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 404);
    throw e;
  }
});

export default tokens;
