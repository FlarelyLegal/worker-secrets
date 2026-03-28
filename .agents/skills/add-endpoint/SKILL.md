---
name: add-endpoint
description: Add a new API endpoint to the secret-vault Cloudflare Worker. Use when creating new routes, resources, or API functionality in the vault.
---

# Add an API endpoint

Routes live in `secret-vault/src/routes/` as Hono sub-routers, mounted in `src/index.ts`.

## CONVENTIONS

### Guards (CRITICAL)

- **ALWAYS** call `hasScope(auth, "read"|"write"|"delete")` before touching secrets
- **ALWAYS** call `audit(env, auth, action, key, ip, userAgent)` after every data access or mutation
- **ALWAYS** wrap crypto and D1 calls in try-catch → return 500 with generic message
- **NEVER** add routes above the auth middleware in `index.ts` unless intentionally public
- **NEVER** return internal details in errors (stack traces, SQL, key fragments)

### Structure

- Sub-routers: `const things = new OpenAPIHono<HonoEnv>()` mounted via `app.route("/things", things)`
- Interactive-only routes: add middleware `if (auth.method !== "interactive") return 403`
- Auth context available after middleware: `c.get("auth")`, `c.get("ip")`, `c.get("ua")`, `c.env.DB`

### Pattern

Use the `createRoute()` + `app.openapi()` pattern. See the [zod-openapi skill](../zod-openapi/SKILL.md) for full examples with schema definitions, route creation, and handler registration.

## CHECKLIST

- [ ] Define request/response schemas in `schemas.ts` (see `zod-openapi` skill)
- [ ] Define route with `createRoute()` including all response codes
- [ ] Register with `app.openapi(route, handler)` — not `app.get()`
- [ ] Use `c.req.valid("json")` / `c.req.valid("param")` — not `c.req.json()`
- [ ] Guard with `hasScope()` if touching secrets
- [ ] Call `audit()` for every data access or mutation
- [ ] Wrap crypto/D1 in try-catch → 500
- [ ] Add D1 migration if new table needed (see `add-migration` skill)
- [ ] Add CLI command if user-facing (see `add-command` skill)
- [ ] Verify new route appears in `/doc` spec
- [ ] Update `secret-vault/README.md` endpoints table

## REFERENCES

- [Zod + OpenAPI skill](../zod-openapi/SKILL.md) — schema and route definition patterns
- [Worker types and helpers](references/worker-types.md) — Env, AuthUser, HonoEnv, crypto/audit helpers
- [Existing endpoints](references/existing-endpoints.md) — full route table with scopes and shapes
