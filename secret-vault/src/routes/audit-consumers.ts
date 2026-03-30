import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { ErrorSchema } from "../schemas.js";
import type { HonoEnv } from "../types.js";

const auditConsumers = new OpenAPIHono<HonoEnv>();

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
  const auth = c.get("auth");
  if (!isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }

  const { key } = c.req.valid("param");
  const { from, to } = c.req.valid("query");

  const conditions: string[] = ["secret_key = ?", "action = 'get'"];
  const binds: unknown[] = [key];

  if (from) {
    conditions.push("timestamp >= ?");
    binds.push(from);
  }
  if (to) {
    conditions.push("timestamp <= ?");
    binds.push(to);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const sql = `
    SELECT
      identity,
      user_agent,
      method,
      COUNT(*) as access_count,
      MAX(timestamp) as last_accessed,
      MIN(timestamp) as first_accessed
    FROM audit_log
    ${where}
    GROUP BY identity, user_agent, method
    ORDER BY access_count DESC
  `;

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all();

  return c.json({ consumers: results as z.infer<typeof ConsumerEntrySchema>[] }, 200);
});

export default auditConsumers;
