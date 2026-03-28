---
name: cloudflare-workers
description: Cloudflare Workers runtime constraints, D1 patterns, Hono conventions, and edge-specific best practices. Use when writing or modifying any Worker code, D1 queries, or wrangler config.
---

# Cloudflare Workers

**ALWAYS** verify patterns against current Cloudflare docs. Use `search_cloudflare_documentation` MCP tool — don't assume Node.js conventions apply.

## CONVENTIONS

### Runtime (CRITICAL)

- **ONLY Web Standards APIs**: `fetch`, `Request`, `Response`, `crypto.subtle`, `TextEncoder`/`TextDecoder`, `URL`, `Headers`
- **NEVER** assume Node.js built-ins work unless behind `nodejs_compat` flag (enabled in this project)
- **NO filesystem, NO long-running processes** — Workers are short-lived request handlers
- CPU time: ~30ms free, ~30s paid. Memory: 128MB. Keep it tight.
- Module-level variables persist within the same isolate — use for caching (CryptoKey, JWKS), **NEVER** for request-specific data

### D1

- **ALWAYS** parameterized queries: `.prepare("SELECT * FROM t WHERE k = ?").bind(key)`
- **NEVER** string interpolation in SQL
- **ALWAYS** use `db.batch()` for atomic multi-statement operations (no traditional transactions)
- SQLite types: TEXT, INTEGER, REAL, BLOB. No native DATE — use `datetime('now')`
- Migrations: sequential numbered SQL files in `migrations/`, applied with `wrangler d1 migrations apply`
- **ALWAYS** test migrations locally first: `npm run db:migrate:local`

See [D1 patterns](references/d1-patterns.md) for query patterns used in this project.

### Hono

- Mount sub-routers with `app.route("/path", router)` — **order matters for middleware**
- Auth middleware uses `app.use("*", ...)` — routes registered BEFORE it are unprotected
- Context: `c.get("auth")`, `c.env.DB`, `c.req.json()`
- Responses: `c.json({ data }, statusCode)` or `c.json({ error: "message" }, 4xx/5xx)`

### Crypto

- **ONLY `crypto.subtle`** — no third-party crypto
- AES-256-GCM, 12-byte random IV per operation
- **ALWAYS** cache CryptoKey at module level — `importKey()` is async and expensive
- Base64 encode ciphertext and IV for D1 TEXT columns

### Secrets and Config

- **`wrangler secret put`** for actual secrets (`ENCRYPTION_KEY`)
- **`"vars"` in wrangler.jsonc** for non-secret config (`ALLOWED_EMAILS`, `TEAM_DOMAIN`, `POLICY_AUD`)
- **`.dev.vars`** for local dev secrets (gitignored)
- **NEVER** put secrets in code, committed env files, or wrangler.jsonc

### MCP Tools (prefer over shell)

- `d1_database_query` — run SQL against D1 directly
- `d1_databases_list` — list databases and get IDs
- `search_cloudflare_documentation` — look up Workers APIs, D1 limits, Access docs
- `workers_list` / `workers_get_worker` — inspect deployed Workers

## ANTI-PATTERNS

| Pattern | Why | Instead |
|---------|-----|---------|
| `new URL()` inside request handler | Per-request overhead | Cache at module level |
| `createRemoteJWKSet()` per request | Object creation overhead | Cache at module level |
| `crypto.subtle.importKey()` per request | Expensive async op | Cache CryptoKey at module level |
| `parseInt()` without radix | Octal parsing bugs | `parseInt(str, 10)` |
| `console.log(secret)` | Leaks to `wrangler tail` | Never log decrypted values |
| Forgetting `await` on D1 ops | Silent failures | `.run()`, `.first()`, `.all()` are all async |
| `res.json()` without guard | HTML error pages throw | Wrap in try-catch or check Content-Type |
