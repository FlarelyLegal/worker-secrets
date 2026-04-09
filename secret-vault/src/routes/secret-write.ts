import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { VaultError } from "../errors.js";
import { ErrorSchema, R403, R500 } from "../schemas.js";
import { KeyParam, SecretCreateBody, SecretCreateResponse } from "../schemas-secrets.js";
import * as secretsService from "../services/secrets.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const secretWrite = new OpenAPIHono<HonoEnv>();

const putRoute = createRoute({
  method: "put",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Create or update a secret",
  request: {
    params: KeyParam,
    body: { content: { "application/json": { schema: SecretCreateBody } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SecretCreateResponse } },
      description: "Secret stored",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    500: R500,
  },
});

secretWrite.openapi(putRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const { value, description, tags, expires_at } = c.req.valid("json");
    const result = await secretsService.setSecret(ctx, key, {
      value,
      description,
      tags,
      expires_at,
    });
    return c.json(result, 201);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400 | 403 | 500);
    throw e;
  }
});

export default secretWrite;
