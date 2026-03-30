---
name: zod-openapi
description: Define API endpoints with Zod schemas and auto-generated OpenAPI specs using @hono/zod-openapi. Use when adding, modifying, or documenting API routes.
---

# Zod + OpenAPI for Hono

All Worker API endpoints use `@hono/zod-openapi`. Schemas define validation AND documentation in one place. The OpenAPI spec is auto-generated - no manual maintenance.

## CONVENTIONS (CRITICAL)

### Packages

- **ONLY `@hono/zod-openapi`** - not `hono-openapi` (different package)
- **ALWAYS** import `z` from `@hono/zod-openapi`, not from `zod` directly
- **ALWAYS** import `OpenAPIHono` instead of `Hono` for routers that have OpenAPI routes
- Regular `Hono` is fine for routers that only use middleware (no OpenAPI routes)

### Schemas

- **ALWAYS** define request/response schemas in the appropriate `schemas-*.ts` file: `schemas.ts` (common), `schemas-secrets.ts`, `schemas-tokens.ts`, `schemas-rbac.ts`
- **ALWAYS** use `.openapi("SchemaName")` on response schemas for spec readability
- **ALWAYS** add `.openapi({ example: ... })` on fields where the example aids understanding
- **NEVER** duplicate types - derive TypeScript types from Zod schemas with `z.infer<>`
- Path params use `z.string().openapi({ param: { name: "key", in: "path" } })`
- Query params use `z.string().optional().openapi({ param: { name: "limit", in: "query" } })`

### Routes

- **ALWAYS** define routes with `createRoute()` - includes method, path, schemas, and descriptions
- **ALWAYS** register routes with `app.openapi(route, handler)` - never `app.get()` for API routes
- **ALWAYS** tag routes for grouping in the spec: `tags: ["Secrets"]`
- **NEVER** use manual `c.req.json()` - Zod validates automatically via `c.req.valid("json")`
- **NEVER** use manual param decoding - use `c.req.valid("param")`
- Error responses still use `c.json({ error: "message" }, status)` - Zod handles input validation, you handle business logic errors

### Error handling

- Use `defaultHook` on `OpenAPIHono` to return `{ error: "message" }` format on validation failures
- Business logic errors (404, 403, 500) are returned manually from handlers
- Validation errors (400) are automatic via Zod

### Spec endpoint

- Serve at `app.doc("/doc", { ... })` - auto-generated from all registered routes
- Include OpenAPI `info`, `security` schemes, and `tags`

## PATTERN

See [route patterns](references/route-patterns.md) for complete examples.
See [schema patterns](references/schema-patterns.md) for Zod schema conventions.

### Quick example

```typescript
// schemas.ts
import { z } from "@hono/zod-openapi";

export const ErrorSchema = z.object({
  error: z.string(),
}).openapi("Error");

export const SecretSchema = z.object({
  key: z.string().openapi({ example: "api-key" }),
  value: z.string().openapi({ example: "sk-..." }),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi("Secret");

export const KeyParam = z.object({
  key: z.string().openapi({ param: { name: "key", in: "path" } }),
});
```

```typescript
// routes/secrets.ts
import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { ErrorSchema, KeyParam, SecretSchema } from "../schemas-secrets.js";

const app = new OpenAPIHono<HonoEnv>();

const getRoute = createRoute({
  method: "get",
  path: "/{key}",
  tags: ["Secrets"],
  request: { params: KeyParam },
  responses: {
    200: { content: { "application/json": { schema: SecretSchema } }, description: "Secret" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

app.openapi(getRoute, async (c) => {
  const { key } = c.req.valid("param");
  // ... handler logic, return c.json(...)
});
```

```typescript
// index.ts
import { OpenAPIHono } from "@hono/zod-openapi";

const app = new OpenAPIHono<HonoEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0].message }, 400);
    }
  },
});

app.doc("/doc", {
  openapi: "3.0.0",
  info: { title: "Secret Vault API", version: "1.0.0" },
});
```

## CHECKLIST

- [ ] Schema defined in `schemas.ts` with `.openapi("Name")`
- [ ] Route defined with `createRoute()` including all response codes
- [ ] Handler uses `c.req.valid("json")` / `c.req.valid("param")` - not `c.req.json()`
- [ ] Route tagged for spec grouping: `tags: ["Secrets"]`
- [ ] Error responses use `ErrorSchema` for consistency
- [ ] Verify spec at `/doc` includes the new route

## ANTI-PATTERNS

| Pattern | Why | Instead |
|---------|-----|---------|
| `import { z } from "zod"` | Missing `.openapi()` method | `import { z } from "@hono/zod-openapi"` |
| `app.get("/path", handler)` | Skips OpenAPI spec | `app.openapi(route, handler)` |
| `await c.req.json()` | Bypasses Zod validation | `c.req.valid("json")` |
| `decodeURIComponent(c.req.param("key"))` | Manual, no validation | `c.req.valid("param").key` |
| Manual `if (!body.value)` checks | Duplicates Zod schema | Define as `z.string().min(1)` |
| Schemas without `.openapi("Name")` | Anonymous in spec | Always name response schemas |
| `import { Hono } from "hono"` for API routes | No OpenAPI support | `import { OpenAPIHono } from "@hono/zod-openapi"` |

## REFERENCES

- [Route patterns](references/route-patterns.md) - full createRoute examples for GET/PUT/DELETE with params, body, query
- [Schema patterns](references/schema-patterns.md) - Zod schema conventions for this project
