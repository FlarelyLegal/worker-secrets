# Performance issues — code-level detail

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

### 1. Audit log growth

**Current:** No retention. Every operation inserts a row. At 100 ops/day, that's 36,500 rows/year.

**Fix options:**

A. Scheduled Worker cleanup (add to wrangler.jsonc):
```toml
[triggers]
crons = ["0 0 * * 0"]  # Weekly
```

B. Migration with manual cleanup:
```sql
DELETE FROM audit_log WHERE timestamp < datetime('now', '-90 days');
```

C. Piggyback cleanup on audit insert:
```typescript
if (Math.random() < 0.01) {  // 1% of requests
  await env.DB.prepare("DELETE FROM audit_log WHERE timestamp < datetime('now', '-90 days')").run();
}
```

### 2. CLI export N+1

`hfs export` does 1 list + N get calls sequentially. The Worker's `/secrets/export` endpoint is interactive-only, so the CLI uses N+1 to support both auth modes. For small vaults (< 100 secrets) this is acceptable. If it becomes a bottleneck, options:

- Add a `VaultClient.export()` method that tries `/secrets/export` first, falls back to N+1
- Parallelize the N+1 with bounded concurrency (`Promise.all` in batches of 5)
