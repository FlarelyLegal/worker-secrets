import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { R403, R500 } from "../schemas.js";
import { SecretImportBody, SecretImportResponse } from "../schemas-secrets.js";
import * as bulkService from "../services/bulk.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const bulkImport = new OpenAPIHono<HonoEnv>();

const importRoute = createRoute({
  method: "post",
  path: "/import",
  tags: ["Secrets"],
  summary: "Bulk import secrets from JSON (interactive only)",
  request: {
    body: { content: { "application/json": { schema: SecretImportBody } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SecretImportResponse } },
      description: "Import results",
    },
    403: R403,
    500: R500,
  },
});

bulkImport.openapi(importRoute, async (c) => {
  // Interactive-only guard stays in HTTP layer (RPC callers bypass this)
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE) return c.json({ error: "Owner only" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const { secrets, overwrite } = c.req.valid("json");
    const result = await bulkService.importSecrets(ctx, { secrets, overwrite });
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 400 | 403 | 500);
    throw e;
  }
});

export default bulkImport;
