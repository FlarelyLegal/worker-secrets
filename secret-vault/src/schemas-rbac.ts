import { z } from "@hono/zod-openapi";
import { VALID_SCOPES } from "./schemas.js";

// --- Users ---

export const UserSchema = z
  .object({
    email: z.string().openapi({ example: "you@example.com" }),
    name: z.string().openapi({ example: "Tim Schneider" }),
    role: z.string().openapi({ example: "admin" }),
    enabled: z.number().openapi({ example: 1 }),
    age_public_key: z.string().nullable().openapi({ example: "age1..." }),
    last_login_at: z.string().nullable(),
    created_by: z.string(),
    created_at: z.string(),
    updated_by: z.string(),
    updated_at: z.string(),
  })
  .openapi("User");

export const UserCreateBody = z.object({
  email: z.string().email("invalid email").max(256),
  name: z.string().max(256).optional().default(""),
  role: z.string().min(1, "role is required").max(64),
});

export const UserUpdateBody = z.object({
  name: z.string().max(256).optional(),
  role: z.string().max(64).optional(),
  enabled: z.boolean().optional(),
  age_public_key: z.string().max(256).nullable().optional(),
  zt_fingerprint: z.string().max(128).optional(),
});

export const EmailParam = z.object({
  email: z
    .string()
    .min(1)
    .openapi({ param: { name: "email", in: "path" }, example: "you@example.com" }),
});

// --- Roles ---

export const RoleSchema = z
  .object({
    name: z.string().openapi({ example: "operator" }),
    scopes: z.string().openapi({ example: "read,write" }),
    allowed_tags: z.string().openapi({ example: "ci,staging" }),
    description: z.string(),
    created_by: z.string(),
    created_at: z.string(),
    updated_by: z.string(),
    updated_at: z.string(),
  })
  .openapi("Role");

export const RoleNameParam = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .openapi({ param: { name: "name", in: "path" }, example: "operator" }),
});

export const RoleCreateBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/, "lowercase alphanumeric, hyphens, underscores"),
  scopes: z.string().refine(
    (s) =>
      s
        .split(",")
        .map((v) => v.trim())
        .every((v) => VALID_SCOPES.includes(v as (typeof VALID_SCOPES)[number])),
    { message: "Valid scopes: *, read, write, delete (comma-separated)" },
  ),
  allowed_tags: z.string().max(500, "allowed_tags exceeds 500 char limit").optional().default(""),
  description: z.string().max(500).optional().default(""),
});

export const RoleUpdateBody = z.object({
  scopes: z
    .string()
    .refine(
      (s) =>
        s
          .split(",")
          .map((v) => v.trim())
          .every((v) => VALID_SCOPES.includes(v as (typeof VALID_SCOPES)[number])),
      { message: "Valid scopes: *, read, write, delete (comma-separated)" },
    )
    .optional(),
  allowed_tags: z.string().max(500).optional(),
  description: z.string().max(500).optional(),
});

// --- Policies ---

export const PolicySchema = z
  .object({
    id: z.number(),
    role: z.string(),
    scopes: z.string().openapi({ example: "read,write" }),
    tags: z.string().openapi({ example: "customer-zero" }),
    description: z.string(),
    created_by: z.string(),
    created_at: z.string(),
  })
  .openapi("Policy");

export const PolicyCreateItem = z.object({
  scopes: z.string().refine(
    (s) =>
      s
        .split(",")
        .map((v) => v.trim())
        .every((v) => VALID_SCOPES.includes(v as (typeof VALID_SCOPES)[number])),
    { message: "Valid scopes: *, read, write, delete (comma-separated)" },
  ),
  tags: z.string().max(500).optional().default(""),
  description: z.string().max(500).optional().default(""),
});

export const PoliciesBody = z.object({
  policies: z.array(PolicyCreateItem).min(1, "At least one policy required"),
});
