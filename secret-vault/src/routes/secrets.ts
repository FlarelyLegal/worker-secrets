import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { VaultError } from "../errors.js";
import { ErrorSchema, PaginationQuery, R403, R500 } from "../schemas.js";
import {
  KeyParam,
  SecretDeleteResponse,
  SecretEntrySchema,
  SecretListItemSchema,
} from "../schemas-secrets.js";
import * as secretsService from "../services/secrets.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const secrets = new OpenAPIHono<HonoEnv>();

// --- List ---
const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Secrets"],
  summary: "List secret keys (no values)",
  request: { query: PaginationQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            secrets: z.array(SecretListItemSchema),
            total: z.number(),
          }),
        },
      },
      description: "Paginated list of secrets",
    },
    403: R403,
  },
});

secrets.openapi(listRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { limit, offset, search } = c.req.valid("query");
    const result = await secretsService.listSecrets(ctx, { limit, offset, search });
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError)
      return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

// --- Get ---
const getRoute = createRoute({
  method: "get",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Get a decrypted secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: { "application/json": { schema: SecretEntrySchema } },
      description: "Decrypted secret",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    500: R500,
  },
});

secrets.openapi(getRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const result = await secretsService.getSecret(ctx, key);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError)
      return c.json({ error: e.message }, e.status as 403 | 404 | 500);
    throw e;
  }
});

// --- Delete ---

const deleteRoute = createRoute({
  method: "delete",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Delete a secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: { "application/json": { schema: SecretDeleteResponse } },
      description: "Deleted",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

secrets.openapi(deleteRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const result = await secretsService.deleteSecret(ctx, key);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError)
      return c.json({ error: e.message }, e.status as 403 | 404);
    throw e;
  }
});

export default secrets;
