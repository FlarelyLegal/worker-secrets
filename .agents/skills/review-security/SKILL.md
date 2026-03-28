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

### HMAC integrity
- **ALWAYS** compute HMAC-SHA256 on write, verify on read
- HMAC key derived via HKDF from `ENCRYPTION_KEY` — **NEVER** use the encryption key directly as HMAC key
- HMAC binds key name + ciphertext + IV, preventing ciphertext swap attacks
- Tamper detection: if HMAC verification fails, return error — do not decrypt

### Scope enforcement
- **ALWAYS** call `hasScope(auth, scope)` before every data operation
- Scopes: `read`, `write`, `delete`, `*`
- Token management + audit: restricted to `interactive` auth only

### Feature flags
- Flags are **plaintext** in KV — they are configuration values, not secrets
- **NEVER** store sensitive data (credentials, keys, tokens) as flags — use encrypted secrets instead
- Flag operations use the same auth model and scope enforcement as secrets
- All flag operations are audit-logged

### Input validation
- **ALWAYS** validate `ENCRYPTION_KEY` format (64 hex chars) — validated on first use
- Body size limits enforced via Zod: value 1MB, key 256 chars, description 1000 chars
- Failed auth attempts logged: `method: "rejected"`, `action: "auth_failed"`
- Security headers: HSTS, X-Request-ID, CSP (HTML only), X-Content-Type-Options

### Error handling
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
- [ ] Crypto ops wrapped in try-catch
- [ ] No new routes above auth middleware in `index.ts` unless intentionally public
- [ ] Error responses don't leak internals
- [ ] Verify HMAC computed on write and verified on read for new endpoints touching secrets

## KNOWN GAPS

- No rate limiting — only Cloudflare edge DDoS protection
- No key rotation — changing `ENCRYPTION_KEY` breaks all secrets
- Email case in audit — stored as-is from JWT, could show mixed case
