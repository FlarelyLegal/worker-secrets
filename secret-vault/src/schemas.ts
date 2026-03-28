import type { RouteConfig } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

// --- Common ---

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "Secret not found" }),
  })
  .openapi("Error");

// Shared response shapes for route definitions
export const R403: RouteConfig["responses"][string] = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Insufficient scope or owner only",
};
export const R500: RouteConfig["responses"][string] = {
  content: { "application/json": { schema: ErrorSchema } },
  description: "Internal error",
};

// --- D1 row types ---

export type SecretRow = {
  key: string;
  value: string;
  iv: string;
  description: string;
  created_at: string;
  updated_at: string;
};

// --- Params ---

export const KeyParam = z.object({
  key: z
    .string()
    .min(1)
    .max(256, "key exceeds 256 char limit")
    .refine((k) => k !== "export" && k !== "import", {
      message: '"export" and "import" are reserved key names',
    })
    .openapi({ param: { name: "key", in: "path" }, example: "api-key" }),
});

export const ClientIdParam = z.object({
  clientId: z
    .string()
    .min(1)
    .openapi({ param: { name: "clientId", in: "path" }, example: "abc123.access" }),
});

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
});

export const AuditQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .openapi({
      param: { name: "limit", in: "query" },
      example: 50,
    }),
});

// --- Secrets ---

export const SecretListItemSchema = z
  .object({
    key: z.string().openapi({ example: "api-key" }),
    description: z.string().openapi({ example: "Anthropic API key" }),
    created_at: z.string().openapi({ example: "2026-03-28 12:00:00" }),
    updated_at: z.string().openapi({ example: "2026-03-28 12:00:00" }),
  })
  .openapi("SecretListItem");

export const SecretEntrySchema = SecretListItemSchema.extend({
  value: z.string().openapi({ example: "sk-ant-..." }),
}).openapi("SecretEntry");

export const SecretExportItemSchema = z
  .object({
    key: z.string(),
    value: z.string().nullable(),
    error: z.string().optional(),
    description: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("SecretExportItem");

export const SecretCreateBody = z.object({
  value: z.string().min(1, "value is required").max(1_000_000, "value exceeds 1MB limit"),
  description: z.string().max(1000, "description exceeds 1000 char limit").optional().default(""),
});

export const SecretCreateResponse = z
  .object({
    ok: z.boolean(),
    key: z.string(),
  })
  .openapi("SecretCreateResponse");

export const SecretDeleteResponse = z
  .object({
    ok: z.boolean(),
    deleted: z.string(),
  })
  .openapi("SecretDeleteResponse");

export const SecretImportItem = z
  .object({
    key: z.string().min(1, "key is required").max(256, "key exceeds 256 char limit"),
    value: z.string().min(1, "value is required").max(1_000_000, "value exceeds 1MB limit"),
    description: z.string().max(1000).optional().default(""),
  })
  .passthrough();

export const SecretImportBody = z.object({
  secrets: z.array(SecretImportItem).min(1, "at least one secret is required"),
  overwrite: z.boolean().optional().default(false),
});

export const SecretImportResponse = z
  .object({
    ok: z.boolean(),
    imported: z.number(),
    skipped: z.number(),
  })
  .openapi("SecretImportResponse");

// --- Tokens ---

export const ServiceTokenSchema = z
  .object({
    client_id: z.string().openapi({ example: "abc123.access" }),
    name: z.string().openapi({ example: "github-actions" }),
    description: z.string(),
    scopes: z.string().openapi({ example: "read,write" }),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
  })
  .openapi("ServiceToken");

export const TokenCreateBody = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().optional().default(""),
  scopes: z.string().optional().default("*"),
});

export const TokenCreateResponse = z
  .object({
    ok: z.boolean(),
    client_id: z.string(),
    name: z.string(),
    scopes: z.string(),
  })
  .openapi("TokenCreateResponse");

export const TokenDeleteResponse = z
  .object({
    ok: z.boolean(),
    revoked: z.string(),
  })
  .openapi("TokenDeleteResponse");

// --- Auth / Admin ---

export const HealthSchema = z
  .object({
    status: z.string().openapi({ example: "ok" }),
  })
  .openapi("Health");

export const WhoamiSchema = z
  .object({
    method: z.string().openapi({ example: "interactive" }),
    identity: z.string().openapi({ example: "you@example.com" }),
    name: z.string().openapi({ example: "owner" }),
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
  })
  .openapi("AuditEntry");
