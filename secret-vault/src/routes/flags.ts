import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope, isAdmin } from "../auth.js";
import {
  ACTION_DELETE_FLAG,
  ACTION_GET_FLAG,
  ACTION_LIST_FLAGS,
  ACTION_SET_FLAG,
  AUTH_INTERACTIVE,
  SCOPE_READ,
} from "../constants.js";
import { ErrorSchema, R403 } from "../schemas.js";
import type { HonoEnv } from "../types.js";

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

type FlagData = z.infer<typeof FlagSchema>;

function inferType(value: unknown): FlagData["type"] {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && value !== null) return "json";
  return "string";
}

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

  const list = await c.env.FLAGS.list();
  const result: FlagData[] = [];
  for (const key of list.keys) {
    const raw = await c.env.FLAGS.get(key.name);
    if (raw) {
      try {
        result.push({ key: key.name, ...JSON.parse(raw) });
      } catch {
        result.push({
          key: key.name,
          value: raw,
          type: "string",
          description: "",
          updated_by: "",
          updated_at: "",
        });
      }
    }
  }
  await audit(c.env, auth, ACTION_LIST_FLAGS, null, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ flags: result }, 200);
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

  const { key } = c.req.valid("param");
  const raw = await c.env.FLAGS.get(key);
  if (raw === null) return c.json({ error: "Flag not found" }, 404);

  let flag: FlagData;
  try {
    flag = { key, ...JSON.parse(raw) };
  } catch {
    flag = { key, value: raw, type: "string", description: "", updated_by: "", updated_at: "" };
  }

  await audit(c.env, auth, ACTION_GET_FLAG, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json(flag, 200);
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

  const { key } = c.req.valid("param");
  const { value, description } = c.req.valid("json");
  const type = inferType(value);
  const now = new Date().toISOString();

  const data = { value, type, description, updated_by: auth.identity, updated_at: now };
  await c.env.FLAGS.put(key, JSON.stringify(data));

  await audit(c.env, auth, ACTION_SET_FLAG, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ key, ...data }, 200);
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

  const { key } = c.req.valid("param");
  await c.env.FLAGS.delete(key);

  await audit(c.env, auth, ACTION_DELETE_FLAG, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, deleted: key }, 200);
});

export default flags;
