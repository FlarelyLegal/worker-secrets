# Zod schema patterns

Schemas are split by domain: `secret-vault/src/schemas.ts` (common), `schemas-secrets.ts`, `schemas-tokens.ts`, `schemas-rbac.ts`. Import `z` from `@hono/zod-openapi`.

## Naming

- Response schemas: `.openapi("SecretEntry")` - PascalCase, appears in spec
- Request body schemas: no `.openapi()` needed - inlined in route definition
- Param schemas: no `.openapi()` needed - just add `param` metadata per field

## Common schemas

```typescript
// Error response - used across all endpoints
export const ErrorSchema = z.object({
  error: z.string().openapi({ example: "Secret not found" }),
}).openapi("Error");

// Success response for mutations
export const OkSchema = z.object({
  ok: z.boolean(),
}).openapi("Ok");
```

## Path param schema

```typescript
export const KeyParam = z.object({
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    example: "api-key",
  }),
});
```

- `param.name` **MUST** match the `{key}` in the route path
- `param.in` is always `"path"` for path params

## Query param schema

```typescript
export const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50).openapi({
    param: { name: "limit", in: "query" },
    example: 50,
  }),
});
```

- Use `z.coerce.number()` for query params - they arrive as strings
- Use `.default()` for optional params with defaults

## Request body schema

```typescript
export const SecretCreateBody = z.object({
  value: z.string().min(1, "value is required"),
  description: z.string().optional().default(""),
});
```

- Validation messages in `.min(1, "message")` become the error text
- Use `.optional().default("")` for optional fields with defaults
- No `.openapi("Name")` needed - body schemas are inlined in route spec

## Response schema

```typescript
export const SecretEntrySchema = z.object({
  key: z.string().openapi({ example: "api-key" }),
  value: z.string().openapi({ example: "sk-ant-..." }),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi("SecretEntry");
```

- **ALWAYS** call `.openapi("Name")` on response schemas
- Add examples on key fields for spec readability
- Timestamps are strings (SQLite `datetime()` returns text)

## Deriving TypeScript types

```typescript
export type SecretEntry = z.infer<typeof SecretEntrySchema>;
```

- **NEVER** define separate TypeScript interfaces for API types
- Derive from Zod schemas with `z.infer<>`
- Keeps types and validation in sync

## Size limits

```typescript
value: z.string().min(1, "required").max(1_000_000, "exceeds 1MB limit"),
key: z.string().min(1).max(256, "exceeds 256 char limit"),
description: z.string().optional().default("").pipe(z.string().max(1000, "exceeds 1000 char limit")),
```

- Use `.max()` for server-enforced size limits
- Error messages from `.max()` become the API error text

## Scope validation

Token scopes are validated by Zod `.refine()` on `TokenCreateBody`. Secret scope checks (`hasScope`) remain in handlers since they depend on the authenticated user.

```typescript
if (!hasScope(auth, "read")) return c.json({ error: "Insufficient scope" }, 403);
```
