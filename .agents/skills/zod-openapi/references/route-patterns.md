# OpenAPI route patterns

Routes use `createRoute()` from `@hono/zod-openapi` and are registered with `app.openapi()`.

## GET with path param

```typescript
import { createRoute } from "@hono/zod-openapi";
import { ErrorSchema, KeyParam, SecretEntrySchema } from "../schemas.js";

const getSecretRoute = createRoute({
  method: "get",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Get a decrypted secret",
  request: {
    params: KeyParam,
  },
  responses: {
    200: {
      content: { "application/json": { schema: SecretEntrySchema } },
      description: "Decrypted secret",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Insufficient scope",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Secret not found",
    },
  },
});

app.openapi(getSecretRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, "read")) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  // ... fetch, decrypt, audit, return
});
```

## GET with query params

```typescript
const auditRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["Admin"],
  summary: "View audit log",
  request: {
    query: AuditQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuditResponseSchema } },
      description: "Audit entries",
    },
  },
});

app.openapi(auditRoute, async (c) => {
  const { limit } = c.req.valid("query");
  // limit is already a number (coerced by Zod), clamped to 1-500
});
```

## PUT with body + path param

```typescript
const setSecretRoute = createRoute({
  method: "put",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Create or update a secret",
  request: {
    params: KeyParam,
    body: {
      content: {
        "application/json": {
          schema: SecretCreateBody,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SecretCreateResponseSchema } },
      description: "Secret stored",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Invalid input",
    },
  },
});

app.openapi(setSecretRoute, async (c) => {
  const { key } = c.req.valid("param");
  const { value, description } = c.req.valid("json");
  // value is guaranteed non-empty (Zod .min(1))
  // description defaults to "" (Zod .default(""))
});
```

## DELETE with path param

```typescript
const deleteSecretRoute = createRoute({
  method: "delete",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Delete a secret",
  request: {
    params: KeyParam,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DeleteResponseSchema } },
      description: "Secret deleted",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Secret not found",
    },
  },
});
```

## GET list (no params)

```typescript
const listSecretsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Secrets"],
  summary: "List all secret keys",
  responses: {
    200: {
      content: { "application/json": { schema: SecretListResponseSchema } },
      description: "List of secrets (no values)",
    },
  },
});
```

## Sub-router setup

```typescript
import { OpenAPIHono } from "@hono/zod-openapi";
import type { HonoEnv } from "../types.js";

const secrets = new OpenAPIHono<HonoEnv>();

// Regular Hono middleware still works
secrets.use("*", async (c, next) => {
  // middleware logic
  return next();
});

// Register OpenAPI routes
secrets.openapi(listSecretsRoute, async (c) => { ... });
secrets.openapi(getSecretRoute, async (c) => { ... });

export default secrets;
```

## Mounting in index.ts

```typescript
import { OpenAPIHono } from "@hono/zod-openapi";
import secrets from "./routes/secrets.js";
import tokens from "./routes/tokens.js";

const app = new OpenAPIHono<HonoEnv>({ ... });

// Regular middleware (auth) still uses app.use()
app.use("*", async (c, next) => { ... });

// Mount sub-routers — their OpenAPI routes merge into parent spec
app.route("/secrets", secrets);
app.route("/tokens", tokens);

// Serve the auto-generated spec
app.doc("/doc", {
  openapi: "3.0.0",
  info: { title: "Secret Vault API", version: "1.0.0" },
  tags: [
    { name: "Secrets", description: "Encrypted secret management" },
    { name: "Tokens", description: "Service token management" },
    { name: "Admin", description: "Audit and system info" },
  ],
});
```

## What NOT to put in OpenAPI routes

- Auth middleware — uses regular `app.use()`, not `createRoute()`
- `/health` — simple public endpoint, can use regular `app.get()`
- Internal helpers — `hasScope()`, `audit()` are called from handlers, not routes
