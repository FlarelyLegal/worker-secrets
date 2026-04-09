import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { VaultError } from "../errors.js";
import { ErrorSchema, R403, R500 } from "../schemas.js";
import { KeyParam } from "../schemas-secrets.js";
import * as versionsService from "../services/versions.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const versions = new OpenAPIHono<HonoEnv>();

const VersionItemSchema = z.object({
  id: z.number(),
  changed_by: z.string(),
  changed_at: z.string(),
});

const versionsRoute = createRoute({
  method: "get",
  path: "/{key}/versions",
  tags: ["Secrets"],
  summary: "List version history for a secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ versions: z.array(VersionItemSchema) }) },
      },
      description: "Version history (values not included for security)",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

versions.openapi(versionsRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const result = await versionsService.listVersions(ctx, key);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError)
      return c.json({ error: e.message }, e.status as 403 | 404);
    throw e;
  }
});

// --- Get version value ---

const getVersionRoute = createRoute({
  method: "get",
  path: "/{key}/versions/{id}",
  tags: ["Secrets"],
  summary: "Get a decrypted version value",
  request: {
    params: z.object({
      key: z
        .string()
        .min(1)
        .openapi({ param: { name: "key", in: "path" }, example: "api-key" }),
      id: z.coerce
        .number()
        .int()
        .min(1)
        .openapi({ param: { name: "id", in: "path" }, example: 1 }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number(),
            key: z.string(),
            value: z.string(),
            description: z.string(),
            changed_by: z.string(),
            changed_at: z.string(),
          }),
        },
      },
      description: "Decrypted version value",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    500: R500,
  },
});

versions.openapi(getVersionRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { key, id } = c.req.valid("param");
    const result = await versionsService.getVersion(ctx, key, id);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError)
      return c.json({ error: e.message }, e.status as 403 | 404 | 500);
    throw e;
  }
});

// --- Restore ---

const VersionIdParam = z.object({
  key: z
    .string()
    .min(1)
    .openapi({ param: { name: "key", in: "path" }, example: "api-key" }),
  id: z.coerce
    .number()
    .int()
    .min(1)
    .openapi({ param: { name: "id", in: "path" }, example: 1 }),
});

const restoreRoute = createRoute({
  method: "post",
  path: "/{key}/versions/{id}/restore",
  tags: ["Secrets"],
  summary: "Restore a secret to a previous version",
  request: { params: VersionIdParam },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean(), key: z.string(), restored_from: z.number() }),
        },
      },
      description: "Secret restored",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    500: R500,
  },
});

versions.openapi(restoreRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { key, id } = c.req.valid("param");
    const result = await versionsService.restoreVersion(ctx, key, id);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError)
      return c.json({ error: e.message }, e.status as 403 | 404 | 500);
    throw e;
  }
});

export default versions;
