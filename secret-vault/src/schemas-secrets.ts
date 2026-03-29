import { z } from "@hono/zod-openapi";

// --- D1 row type ---

export type SecretRow = {
  key: string;
  value: string;
  iv: string;
  hmac: string;
  description: string;
  tags: string;
  expires_at: string | null;
  created_by: string;
  updated_by: string;
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

// --- Schemas ---

export const SecretListItemSchema = z
  .object({
    key: z.string().openapi({ example: "api-key" }),
    description: z.string().openapi({ example: "Anthropic API key" }),
    tags: z.string().openapi({ example: "production,ci" }),
    expires_at: z.string().nullable().openapi({ example: "2026-06-01 00:00:00" }),
    created_by: z.string().openapi({ example: "you@example.com" }),
    updated_by: z.string().openapi({ example: "you@example.com" }),
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
    tags: z.string(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("SecretExportItem");

export const SecretCreateBody = z.object({
  value: z.string().min(1, "value is required").max(1_000_000, "value exceeds 1MB limit"),
  description: z.string().max(1000, "description exceeds 1000 char limit").optional().default(""),
  tags: z.string().max(500, "tags exceeds 500 char limit").optional().default(""),
  expires_at: z.string().nullable().optional().default(null),
});

export const SecretCreateResponse = z
  .object({ ok: z.boolean(), key: z.string() })
  .openapi("SecretCreateResponse");
export const SecretDeleteResponse = z
  .object({ ok: z.boolean(), deleted: z.string() })
  .openapi("SecretDeleteResponse");

export const SecretImportItem = z.object({
  key: z
    .string()
    .min(1, "key is required")
    .max(256, "key exceeds 256 char limit")
    .refine((k) => k !== "export" && k !== "import", {
      message: '"export" and "import" are reserved key names',
    }),
  value: z.string().min(1, "value is required").max(1_000_000, "value exceeds 1MB limit"),
  description: z.string().max(1000).optional().default(""),
  tags: z.string().max(500).optional().default(""),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  created_by: z.string().optional(),
  updated_by: z.string().optional(),
});

export const SecretImportBody = z.object({
  secrets: z.array(SecretImportItem).min(1, "at least one secret is required"),
  overwrite: z.boolean().optional().default(false),
});

export const SecretImportResponse = z
  .object({ ok: z.boolean(), imported: z.number(), skipped: z.number() })
  .openapi("SecretImportResponse");
