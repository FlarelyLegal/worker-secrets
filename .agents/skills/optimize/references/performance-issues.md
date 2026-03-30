# Performance issues - code-level detail

## Resolved

### CryptoKey caching (DONE)

`getKey()` in `secret-vault/src/crypto.ts` caches the imported CryptoKey at module level. Workers reuse the module between requests within the same isolate, so the key is imported once and reused.

### JWKS set caching (DONE)

`getJWKS()` caches the jose JWKS fetcher at module level. Avoids URL parsing and object creation per request. jose internally caches the HTTP fetch.

### Bulk export endpoint (DONE)

`GET /secrets/export` decrypts all secrets server-side in one D1 query. Per-row try-catch handles corrupted secrets gracefully (returns `value: null, error: "Decryption failed"` for that row).

### parseInt guard on audit limit (DONE)

The audit endpoint uses NaN-safe parsing with clamp:
```typescript
const raw = parseInt(c.req.query("limit") ?? "50", 10);
const limit = Math.min(Math.max(Number.isNaN(raw) ? 50 : raw, 1), 500);
```

## Remaining

### Audit log growth (DONE)

Background cleanup via `waitUntil()` with 90-day retention. No longer unbounded.

### CLI bulk export (PARTIALLY DONE)

The CLI tries the bulk `/secrets/export` endpoint first, then falls back to N+1 for service tokens (which cannot use the interactive-only bulk endpoint). Acceptable for small vaults.

### CLI export N+1 for service tokens

Service tokens still use N+1 (`list()` + `get()` per secret). If this becomes a bottleneck, options:
- Parallelize the N+1 with bounded concurrency (`Promise.all` in batches of 5)
- Add a service-token-compatible bulk endpoint
