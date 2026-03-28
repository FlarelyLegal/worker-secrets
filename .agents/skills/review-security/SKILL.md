---
name: review-security
description: Review code changes for security issues specific to this encrypted secret vault. Use when modifying auth, encryption, scope enforcement, or any data-access paths.
---

# Security review

This is an encrypted secret store — security mistakes leak credentials.

## CONVENTIONS (CRITICAL)

### Auth
- **ALWAYS** validate JWT signature against Cloudflare JWKS + check issuer + AUD
- **ALWAYS** reject unregistered service tokens even if Access JWT is valid
- **ALWAYS** match `ALLOWED_EMAILS` case-insensitively
- **NEVER** fall back between auth modes — partial config = hard error
- **NEVER** store service token credentials on disk

### Encryption
- **ONLY `crypto.subtle`** — no third-party crypto
- **ONLY AES-256-GCM** with random 12-byte IV per secret
- `ENCRYPTION_KEY` is a Wrangler secret — **NEVER** in code or wrangler.jsonc
- Changing the key makes all existing secrets unreadable (no rotation support)

### Scope enforcement
- **ALWAYS** call `hasScope(auth, scope)` before every data operation
- Scopes: `read`, `write`, `delete`, `*`
- Token management + audit: restricted to `interactive` auth only

### Error handling
- **ALWAYS** wrap `c.req.json()` in try-catch → 400
- **ALWAYS** wrap `encrypt()`/`decrypt()` in try-catch → 500
- **NEVER** return stack traces, SQL errors, or key fragments in error responses

### CLI
- **ALWAYS** use `execFileSync` — never `execSync` with string interpolation
- JWT stored locally is short-lived. Service token creds are env-var-only.

See [auth flow](references/auth-flow.md) for the full authentication walkthrough.

## REVIEW CHECKLIST

- [ ] No secret values logged, returned in list endpoints, or included in errors
- [ ] New endpoints have scope guards via `hasScope()`
- [ ] All data access calls `audit()`
- [ ] No raw `ENCRYPTION_KEY` exposure outside `encrypt`/`decrypt`
- [ ] Auth middleware cannot be bypassed (route ordering in Hono)
- [ ] D1 queries use `.bind()`, never string interpolation
- [ ] `c.req.json()` wrapped in try-catch
- [ ] Crypto ops wrapped in try-catch
- [ ] No new routes above auth middleware in `index.ts` unless intentionally public
- [ ] Error responses don't leak internals

## KNOWN GAPS

- No rate limiting — only Cloudflare edge DDoS protection
- No audit log retention — grows unbounded
- No failed auth logging — rejected requests not in audit_log
- No key rotation — changing `ENCRYPTION_KEY` breaks all secrets
- Email case in audit — stored as-is from JWT, could show mixed case
