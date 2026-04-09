import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { ErrorSchema } from "../schemas.js";
import * as adminService from "../services/admin.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const auditConsumers = new OpenAPIHono<HonoEnv>();

// Admin-only middleware (interactive sessions only)
auditConsumers.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

const ConsumerEntrySchema = z
  .object({
    identity: z.string().openapi({ example: "alice@co.com" }),
    user_agent: z.string().nullable().openapi({ example: "hfs-cli/0.23.1" }),
    method: z.string().openapi({ example: "interactive" }),
    access_count: z.number().openapi({ example: 42 }),
    last_accessed: z.string().openapi({ example: "2026-03-28T12:00:00Z" }),
    first_accessed: z.string().openapi({ example: "2026-01-01T00:00:00Z" }),
  })
  .openapi("ConsumerEntry");

const ConsumerQuery = z.object({
  from: z
    .string()
    .optional()
    .openapi({ param: { name: "from", in: "query" }, example: "2026-03-01" }),
  to: z
    .string()
    .optional()
    .openapi({ param: { name: "to", in: "query" }, example: "2026-03-31" }),
});

const consumersRoute = createRoute({
  method: "get",
  path: "/audit/consumers/{key}",
  tags: ["Admin"],
  summary: "List consumers of a specific secret (admin only)",
  request: {
    params: z.object({
      key: z.string().openapi({ param: { name: "key", in: "path" }, example: "stripe-api-key" }),
    }),
    query: ConsumerQuery,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ consumers: z.array(ConsumerEntrySchema) }),
        },
      },
      description: "Unique consumers of the secret, ordered by access count",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Admin only",
    },
  },
});

auditConsumers.openapi(consumersRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { key } = c.req.valid("param");
    const { from, to } = c.req.valid("query");
    const result = await adminService.getAuditConsumers(ctx, key, { from, to });
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

export default auditConsumers;
