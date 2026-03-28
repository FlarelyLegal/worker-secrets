---
name: optimize
description: Optimize the secret-vault Worker and hfs CLI for performance, latency, and resource usage. Use when addressing slow responses, high latency, or scaling concerns.
---

# Optimize

## CONVENTIONS

- **ALWAYS** cache expensive objects at module level (CryptoKey, JWKS set)
- **NEVER** create `new URL()`, `createRemoteJWKSet()`, or `importKey()` inside request handlers
- **NEVER** use `String.fromCharCode(...spread)` — stack overflows on large data; use loops

## ALREADY OPTIMIZED

- [x] CryptoKey cached at module level (`getKey()`)
- [x] JWKS set cached at module level (`getJWKS()`)
- [x] Bulk export endpoint (`GET /secrets/export`) — one D1 query, server-side decrypt
- [x] parseInt guard on audit limit — NaN-safe with clamp to 1–500

## REMAINING ISSUES

### Audit log growth (LOW but compounds)

`audit_log` grows unbounded. Large tables slow `ORDER BY timestamp DESC`.

Check size: `SELECT COUNT(*) as total, MIN(timestamp) as oldest FROM audit_log`

Fix options: scheduled Worker cleanup, manual `DELETE WHERE timestamp < datetime('now', '-90 days')`, or piggyback cleanup on insert.

### CLI export N+1 (LOW)

`hfs export` calls `list()` + `get()` per secret sequentially. Worker has bulk `/secrets/export` but it's interactive-only. N+1 works for both auth modes. Acceptable for small vaults.

## REFERENCES

- [Performance details](references/performance-issues.md) — code-level analysis of resolved and remaining issues
