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

export const ScopesString = z.string().refine(
  (s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .every((v) => VALID_SCOPES.includes(v as (typeof VALID_SCOPES)[number])),
  { message: "Valid scopes: *, read, write, delete (comma-separated)" },
);

// --- Admin ---

export const HealthSchema = z
  .object({
    status: z.string().openapi({ example: "ok" }),
    database: z.string().openapi({ example: "ok" }),
    kv: z.string().openapi({ example: "ok" }),
    version: z.string().openapi({ example: "0.20.0" }),
    region: z.string().openapi({ example: "ATL" }),
    maintenance: z.boolean().openapi({ example: false }),
    read_only: z.boolean().openapi({ example: false }),
    timestamp: z.string().openapi({ example: "2026-03-29T04:30:00.000Z" }),
  })
  .openapi("Health");

export const WhoamiSchema = z
  .object({
    method: z.string().openapi({ example: "interactive" }),
    identity: z.string().openapi({ example: "you@example.com" }),
    name: z.string().openapi({ example: "Tim Schneider" }),
    role: z.string().openapi({ example: "admin" }),
    scopes: z.array(z.string()).openapi({ example: ["*"] }),
    e2e: z.boolean().openapi({ example: true, description: "Age public key registered" }),
    deviceBound: z
      .boolean()
      .openapi({ example: true, description: "ZT CA fingerprint registered" }),
    policies: z.number().openapi({ example: 2, description: "Number of policy rules on role" }),
    lastLogin: z.string().nullable().openapi({ example: "2026-03-29 20:42:58" }),
    totalSecrets: z.number().openapi({ example: 15, description: "Total secrets in vault" }),
    warp: z
      .object({
        connected: z.boolean().openapi({ example: true }),
        ztVerified: z.boolean().openapi({ example: true }),
        deviceId: z.string().optional().openapi({ example: "device-abc-123" }),
      })
      .optional(),
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
    prev_hash: z.string().nullable(),
  })
  .openapi("AuditEntry");
