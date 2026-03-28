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
- [x] parseInt guard on audit limit — NaN-safe with clamp to 1-500
- [x] Audit log retention — background cleanup via `waitUntil()`, 90-day retention
- [x] Bulk import atomic — `db.batch()` for all-or-nothing imports
- [x] CLI bulk export — tries `/secrets/export` first, falls back to N+1
- [x] HMAC key cached at module level — HKDF derivation runs once per isolate, not per request

## REMAINING ISSUES

### CLI export N+1 for service tokens (LOW)

Service tokens cannot use the bulk `/secrets/export` endpoint (interactive-only). The CLI falls back to N+1 (`list()` + `get()` per secret) for service token auth. Acceptable for small vaults.

## REFERENCES

- [Performance details](references/performance-issues.md) — code-level analysis of resolved and remaining issues
