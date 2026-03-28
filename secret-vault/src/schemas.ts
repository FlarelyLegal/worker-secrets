import type { RouteConfig } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

// --- Common ---

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "Secret not found" }),
  })
  .openapi("Error");

export const R403: RouteConfig["responses"][string] = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Insufficient scope or owner only",
};
export const R500: RouteConfig["responses"][string] = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Internal error",
};

// --- Shared params ---

export const PaginationQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .openapi({
      param: { name: "limit", in: "query" },
      example: 100,
    }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({
      param: { name: "offset", in: "query" },
      example: 0,
    }),
  search: z
    .string()
    .optional()
    .openapi({
      param: { name: "search", in: "query" },
      example: "api",
    }),
});

export const AuditQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .openapi({ param: { name: "limit", in: "query" }, example: 50 }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({ param: { name: "offset", in: "query" }, example: 0 }),
  identity: z
    .string()
    .optional()
    .openapi({ param: { name: "identity", in: "query" }, example: "you@example.com" }),
  action: z
    .string()
    .optional()
    .openapi({ param: { name: "action", in: "query" }, example: "get" }),
  key: z
    .string()
    .optional()
    .openapi({ param: { name: "key", in: "query" }, example: "api-key" }),
  method: z
    .string()
    .optional()
    .openapi({ param: { name: "method", in: "query" }, example: "interactive" }),
  from: z
    .string()
    .optional()
    .openapi({ param: { name: "from", in: "query" }, example: "2026-03-01" }),
  to: z
    .string()
    .optional()
    .openapi({ param: { name: "to", in: "query" }, example: "2026-03-31" }),
});

// --- Scopes (shared by tokens and RBAC) ---

export const VALID_SCOPES = ["*", "read", "write", "delete"] as const;

// --- Admin ---

export const HealthSchema = z
  .object({
    status: z.string().openapi({ example: "ok" }),
    database: z.string().openapi({ example: "ok" }),
    kv: z.string().openapi({ example: "ok" }),
  })
  .openapi("Health");

export const WhoamiSchema = z
  .object({
    method: z.string().openapi({ example: "interactive" }),
    identity: z.string().openapi({ example: "you@example.com" }),
    name: z.string().openapi({ example: "Tim Schneider" }),
    role: z.string().openapi({ example: "admin" }),
    scopes: z.array(z.string()).openapi({ example: ["*"] }),
  })
  .openapi("Whoami");

export const AuditEntrySchema = z
  .object({
    id: z.number(),
    timestamp: z.string(),
    method: z.string(),
    identity: z.string(),
    action: z.string(),
    secret_key: z.string().nullable(),
    ip: z.string().nullable(),
    user_agent: z.string().nullable(),
    request_id: z.string().nullable(),
  })
  .openapi("AuditEntry");
