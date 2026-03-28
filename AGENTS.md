# SECRETS KNOWLEDGE BASE

## OVERVIEW

Encrypted secret management on Cloudflare Workers. Two packages: Worker API (`secret-vault/`) + CLI (`hfs/`). Dual auth via Cloudflare Access (interactive IdP + hardware key, or registered service tokens). AES-256-GCM at rest.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Worker entry | `secret-vault/src/index.ts` | OpenAPIHono app, middleware, route mounting, `/doc` spec |
| Worker schemas | `secret-vault/src/schemas.ts` | All Zod schemas for request/response validation |
| Worker auth | `secret-vault/src/auth.ts` | authenticate, hasScope, audit, JWKS cache |
| Worker crypto | `secret-vault/src/crypto.ts` | AES-256-GCM encrypt/decrypt, key cache |
| Worker routes | `secret-vault/src/routes/` | `secrets.ts` and `tokens.ts` OpenAPI sub-routers |
| Worker types | `secret-vault/src/types.ts` | Env, AuthUser, HonoEnv |
| CLI entry | `hfs/src/cli.ts` | Program setup, command registration |
| CLI commands | `hfs/src/commands/` | `auth.ts`, `secrets.ts`, `tokens.ts`, `admin.ts`, `completion.ts` |
| CLI client | `hfs/src/client.ts` | `VaultClient` class with typed methods |
| CLI config | `hfs/src/config.ts` | `resolveAuth()`, JWT storage |
| CLI helpers | `hfs/src/helpers.ts` | `die()`, `client()`, `confirm()`, `readStdin()` |
| D1 schema | `secret-vault/migrations/` | Sequential numbered SQL files |
| Wrangler config | `secret-vault/wrangler.jsonc` | D1 binding, env vars, compat flags |
| Version | `VERSION` (repo root) | Single source of truth for all version refs |

## CONVENTIONS

### Crypto (CRITICAL)

- **ONLY `crypto.subtle`** for encryption — no third-party crypto libraries
- **ONLY AES-256-GCM** with random 12-byte IV per operation
- **NEVER** log decrypted values, encryption keys, or tokens (`console.log` goes to `wrangler tail`)
- **NEVER** expose `ENCRYPTION_KEY` outside `encrypt()`/`decrypt()` helpers
- **ALWAYS** wrap `encrypt()`/`decrypt()` in try-catch → return `{ error }` JSON, not stack traces
- CryptoKey and JWKS set are cached at module level — do not recreate per request

### Auth (CRITICAL)

- **Two paths, no fallback, no mixing**: interactive JWT or service token headers
- **NEVER** fall back between auth modes — partial config is a hard error
- **NEVER** store service token credentials on disk — env vars only (`HFS_CLIENT_ID`, `HFS_CLIENT_SECRET`)
- **ALWAYS** validate JWT signature against Cloudflare JWKS + check issuer + AUD
- Unregistered service tokens are rejected even if Access JWT is valid

### Worker

- **ALWAYS** define routes with `createRoute()` + `app.openapi()` — see `zod-openapi` skill
- **ALWAYS** define request/response schemas in `schemas.ts` with Zod
- **ALWAYS** use `c.req.valid("json")` / `c.req.valid("param")` — never `c.req.json()`
- **ALWAYS** call `hasScope(auth, scope)` before any endpoint touching secrets
- **ALWAYS** call `audit(env, auth, action, key, ip)` after every data access or mutation
- **ALWAYS** use parameterized D1 queries with `.bind()` — never interpolate user input
- **NEVER** add routes above the auth middleware in `index.ts` unless intentionally public
- **NEVER** return stack traces, SQL errors, or key fragments in error responses
- OpenAPI spec auto-served at `/doc` — verify new routes appear there

### CLI

- **ALWAYS** use `execFileSync` for shell commands — never `execSync` with string interpolation
- **ALWAYS** wrap client calls in try-catch and use `die(msg)` for fatal errors
- **ALWAYS** use `confirm()` helper before destructive actions (`rm`, `token revoke`, `config clear`)
- **ALWAYS** use `client()` helper for authenticated `VaultClient` instances

### Dependencies

- Worker: `hono`, `jose`, `@hono/zod-openapi` (includes `zod`). **Think hard before adding another.**
- CLI: `commander`, `conf`, `chalk`. **Think hard before adding another.**

### Versioning

- **ONLY** source of truth: root `VERSION` file
- Run `npm run sync-version` to propagate to `hfs/package.json`
- CLI reads version from `package.json` at runtime — no hardcoded constants
- **NEVER** edit version in `hfs/package.json` directly

### Quality

- **ALWAYS** type-check before committing: `cd secret-vault && npx tsc --noEmit` + `cd hfs && npx tsc --noEmit`
- **ALWAYS** lint: `npx biome check .` from repo root
- **ALWAYS** build CLI after changes: `cd hfs && npm run build`

## ANTI-PATTERNS

| Pattern | Why | Instead |
|---------|-----|---------|
| `app.get("/path", handler)` | Skips OpenAPI spec | `app.openapi(route, handler)` |
| `await c.req.json()` | Bypasses Zod validation | `c.req.valid("json")` |
| `import { z } from "zod"` | Missing `.openapi()` method | `import { z } from "@hono/zod-openapi"` |
| `import { Hono }` for API routes | No OpenAPI support | `import { OpenAPIHono }` |
| `execSync(\`cmd ${url}\`)` | Shell injection | `execFileSync("cmd", ["arg", url])` |
| SQL with `${variable}` | SQL injection | `.prepare("... ?").bind(variable)` |
| Route above auth middleware | Bypasses authentication | Register after `app.use("*", ...)` |
| `console.log(plaintext)` | Leaks secrets to wrangler tail | Never log decrypted values |
| Creds in config file | Credentials on disk | Env vars only |
| Auth mode fallback | Silent security downgrade | Hard error on partial config |
| Third-party crypto | Unnecessary dependency | `crypto.subtle` (Workers built-in) |
| `new URL()` / `importKey()` in handler | Per-request overhead | Cache at module level |

## SKILLS

| Skill | When |
|-------|------|
| [cloudflare-workers](.agents/skills/cloudflare-workers/SKILL.md) | Any Worker code, D1 queries, wrangler config |
| [zod-openapi](.agents/skills/zod-openapi/SKILL.md) | Defining API schemas, validation, and OpenAPI spec |
| [add-endpoint](.agents/skills/add-endpoint/SKILL.md) | Adding API routes to the Worker |
| [add-command](.agents/skills/add-command/SKILL.md) | Adding CLI commands to hfs |
| [add-migration](.agents/skills/add-migration/SKILL.md) | Changing the D1 schema |
| [add-test](.agents/skills/add-test/SKILL.md) | Writing tests (vitest + miniflare) |
| [deploy](.agents/skills/deploy/SKILL.md) | Deploying the Worker or publishing the CLI |
| [local-dev](.agents/skills/local-dev/SKILL.md) | Setting up local development |
| [troubleshoot](.agents/skills/troubleshoot/SKILL.md) | Diagnosing errors and unexpected behavior |
| [review-security](.agents/skills/review-security/SKILL.md) | Reviewing changes for security issues |
| [optimize](.agents/skills/optimize/SKILL.md) | Fixing performance bottlenecks |

## COMMANDS

```bash
# Root
npm run lint                    # Biome check
npm run lint:fix                # Biome auto-fix
npm run changelog               # Generate CHANGELOG.md via git-cliff
npm run sync-version            # VERSION → hfs/package.json

# Worker
cd secret-vault
npx tsc --noEmit                # Type-check
npm run dev                     # Local dev (miniflare)
npm run deploy                  # Deploy to Cloudflare
npm run db:migrate              # Apply D1 migrations
npm run db:migrate:local        # Apply migrations locally
npm run generate-keys           # Generate ENCRYPTION_KEY

# CLI
cd hfs
npm run build                   # Compile TypeScript
npm run dev                     # Watch mode
```

## KNOWN GAPS

- No rate limiting (relying on Cloudflare edge protection)
- No encryption key rotation (changing the key breaks all secrets)
- No audit log retention (grows unbounded)
- No test infrastructure yet
