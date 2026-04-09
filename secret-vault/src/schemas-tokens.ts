import { z } from "@hono/zod-openapi";
import { ScopesString } from "./schemas.js";

export const ClientIdParam = z.object({
  clientId: z
    .string()
    .min(1)
    .openapi({ param: { name: "clientId", in: "path" }, example: "abc123.access" }),
});

export const ServiceTokenSchema = z
  .object({
    client_id: z.string().openapi({ example: "abc123.access" }),
    name: z.string().openapi({ example: "github-actions" }),
    description: z.string().nullable(),
    scopes: z.string().nullable().openapi({ example: "read,write" }),
    role: z.string().nullable().openapi({ example: "operator" }),
    created_by: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    last_used_at: z.string().nullable(),
  })
  .openapi("ServiceToken");

export const TokenCreateBody = z.object({
  name: z.string().min(1, "name is required").max(256, "name exceeds 256 char limit"),
  description: z.string().max(1000).optional().default(""),
  scopes: ScopesString.optional().default("*"),
  role: z.string().max(64).optional(),
  client_secret_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "Must be a 64-char lowercase hex SHA-256 hash")
    .optional(),
  age_public_key: z.string().startsWith("age1").max(100).optional(),
});

export const TokenCreateResponse = z
  .object({ ok: z.boolean(), client_id: z.string(), name: z.string(), scopes: z.string() })
  .openapi("TokenCreateResponse");
export const TokenDeleteResponse = z
  .object({ ok: z.boolean(), revoked: z.string() })
  .openapi("TokenDeleteResponse");
