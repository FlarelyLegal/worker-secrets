import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { hasScope, isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE, SCOPE_READ } from "../constants.js";
import { VaultError } from "../errors.js";
import { ErrorSchema, R403 } from "../schemas.js";
import * as flagsService from "../services/flags.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const flags = new OpenAPIHono<HonoEnv>();

// Flag stored as JSON in KV: { value, type, description, updated_by, updated_at }
const FlagSchema = z
  .object({
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())]),
    type: z.enum(["string", "number", "boolean", "json"]),
    description: z.string(),
    updated_by: z.string(),
    updated_at: z.string(),
  })
  .openapi("Flag");

const FlagBody = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())]),
  description: z.string().max(1000).optional().default(""),
});

// --- List ---

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Flags"],
  summary: "List all feature flags",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ flags: z.array(FlagSchema) }) } },
      description: "All flags with metadata",
    },
    403: R403,
  },
});

flags.openapi(listRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const result = await flagsService.listFlags(ctx);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

// --- Get ---

const getRoute = createRoute({
  method: "get",
  path: "/{key}",
  tags: ["Flags"],
  summary: "Get a feature flag",
  request: {
    params: z.object({
      key: z
        .string()
        .min(1)
        .openapi({ param: { name: "key", in: "path" }, example: "maintenance" }),
    }),
  },
  responses: {
    200: { content: { "application/json": { schema: FlagSchema } }, description: "Flag" },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

flags.openapi(getRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const result = await flagsService.getFlagByKey(ctx, key);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 404);
    throw e;
  }
});

// --- Set ---

const setRoute = createRoute({
  method: "put",
  path: "/{key}",
  tags: ["Flags"],
  summary: "Set a feature flag (string, number, boolean, or JSON)",
  request: {
    params: z.object({
      key: z
        .string()
        .min(1)
        .max(256)
        .openapi({ param: { name: "key", in: "path" }, example: "maintenance" }),
    }),
    body: { content: { "application/json": { schema: FlagBody } }, required: true },
  },
  responses: {
    200: { content: { "application/json": { schema: FlagSchema } }, description: "Flag set" },
    403: R403,
  },
});

flags.openapi(setRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth))
    return c.json({ error: "Admin only" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await flagsService.setFlag(ctx, key, body);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

// --- Delete ---

const deleteRoute = createRoute({
  method: "delete",
  path: "/{key}",
  tags: ["Flags"],
  summary: "Delete a feature flag",
  request: {
    params: z.object({
      key: z
        .string()
        .min(1)
        .openapi({ param: { name: "key", in: "path" }, example: "maintenance" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean(), deleted: z.string() }) },
      },
      description: "Flag deleted",
    },
    403: R403,
  },
});

flags.openapi(deleteRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth))
    return c.json({ error: "Admin only" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const result = await flagsService.deleteFlag(ctx, key);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

export default flags;
