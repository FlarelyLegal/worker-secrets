# Security Audit — 2026-03-29

Automated audit of `secret-vault/src/` across 7 attack surfaces using 3 parallel security auditor agents. No source code was modified.

## Findings Summary

| # | Severity | Finding | File | Line(s) |
|---|----------|---------|------|---------|
| 1 | **HIGH** | Webhook SSRF — no private IP/hostname blocking | index.ts | 213 |
| 2 | **MEDIUM** | Import overwrite skips tag check on existing secrets | bulk.ts | 151-164 |
| 3 | **MEDIUM** | PUT /users skips last-admin protection | users.ts | 86-117 |
| 4 | **MEDIUM** | Import drops `expires_at` — imported secrets never expire | bulk.ts | 289-311 |
| 5 | **MEDIUM** | Webhook payloads have no HMAC signature | index.ts | 212-235 |
| 6 | **MEDIUM** | Secrets without HMAC served when flag is off (default) | secrets.ts | 148-165 |
| 7 | **MEDIUM** | Re-encrypt does not verify old HMAC before migrating | admin-ops.ts | 50-83 |
| 8 | MEDIUM | Unescaped `BRAND_NAME` in `/doc` HTML | index.ts | 145-161 |
| 9 | LOW | Feature flags readable by non-admin (leaks security config) | flags.ts | 58-60 |
| 10 | LOW | Burn-after-reading deletes without delete scope or audit log | secrets.ts | 187-189 |
| 11 | LOW | Roleless service tokens bypass tag restrictions | auth.ts | 107-118 |
| 12 | LOW | Built-in admin role can be weakened or deleted | roles.ts | 78-103 |
| 13 | LOW | Audit chain hash omits timestamp | auth.ts | 267-278 |
| 14 | LOW | Auto-provision has no email domain restriction | auth.ts | 200-221 |
| 15 | LOW | Missing single-quote escaping in `esc()` | pages.ts | 19-25 |
| 16 | LOW | Geo-fence error leaks detected country | index.ts | 183-184 |
| 17 | LOW | Regex pattern reflected in error message | secret-write.ts | 70 |

**Critical: 0 | High: 1 | Medium: 7 | Low: 8**

---

## HIGH

### 1. Webhook SSRF — No Private IP/Hostname Blocking

**File:** `index.ts:213`

The webhook URL validation only checks `startsWith("https://")`. An admin can set the webhook to internal addresses like `https://169.254.169.254` (cloud metadata), `https://localhost`, or `https://10.x.x.x`, using the worker as an SSRF proxy.

**Fix:** Parse the URL and reject private/reserved IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1), `localhost`, and hostnames without dots.

---

## MEDIUM

### 2. Import Overwrite Skips Tag Check on Existing Secrets

**File:** `bulk.ts:151-164`

When `overwrite: true`, the import route checks that new items' tags are within the caller's allowed tags, but does not check the existing secret's tags. A tag-restricted user could overwrite secrets outside their scope. Compare with `PUT /secrets/{key}` which correctly checks `hasTagAccess(auth, existing.tags)`.

**Fix:** Fetch existing secret tags before overwrite and verify `hasTagAccess`.

### 3. PUT /users Skips Last-Admin Protection

**File:** `users.ts:86-117`

The `PUT /{email}` endpoint uses `INSERT ... ON CONFLICT DO UPDATE`, which can change an existing admin's role. Unlike `PATCH /{email}` (which has the last-admin guard), PUT has no `adminCount` check. The last admin could be demoted.

**Fix:** Add the same `adminCount` check from PATCH to PUT.

### 4. Import Drops `expires_at`

**File:** `bulk.ts:289-311`

The import INSERT statement does not include `expires_at`. Secrets with expiration dates lose them on import and persist indefinitely.

**Fix:** Add `expires_at` to the import INSERT, binding from `item.expires_at`.

### 5. Webhook Payloads Have No Authentication

**File:** `index.ts:212-235`

Webhook requests carry full audit data (identity, action, secret key, IP) but include no HMAC signature or shared secret. A compromised or spoofed webhook endpoint receives unauthenticated data.

**Fix:** Add an HMAC signature header using the integrity key or a dedicated webhook secret.

### 6. Secrets Without HMAC Served by Default

**File:** `secrets.ts:148-165` (also `versions.ts`, `bulk.ts`)

When `hmac_required` flag is off (default), secrets missing an HMAC are decrypted without integrity verification. A database-level attacker could tamper with ciphertext.

**Fix:** Enable `hmac_required` flag after completing `hfs re-encrypt`. Document this in the migration guide.

### 7. Re-encrypt Does Not Verify Old HMAC

**File:** `admin-ops.ts:50-83`

The re-encrypt endpoint decrypts legacy secrets without verifying their existing HMAC (if present). AES-GCM's auth tag prevents most tampering, but adding HMAC verification before migration would catch any that slipped through.

**Fix:** Call `verifyHmac` before `decrypt` for secrets that have an HMAC.

### 8. Unescaped BRAND_NAME in /doc HTML

**File:** `index.ts:145-161`

The `/doc` route interpolates `BRAND_NAME` into HTML `<title>` without escaping. Operator-controlled, but defense-in-depth mandates escaping. The `pages.ts` module correctly uses `esc()` everywhere.

**Fix:** Apply `esc()` to `brand` in the `/doc` route.

---

## LOW

### 9. Feature Flags Readable by Non-Admin

`GET /flags` only requires `SCOPE_READ`. Any user can see security-sensitive flags like `allowed_countries`, `auto_provision_role`, `hmac_required`.

### 10. Burn-After-Reading Deletes Without Delete Scope

A read-only user can trigger deletion of burn-tagged secrets by reading them. The deletion is not audit-logged as a delete action.

### 11. Roleless Service Tokens Bypass Tag Restrictions

Tokens registered without a role get `allowedTags: []`, which means no restrictions. They can access secrets with any tags.

### 12. Admin Role Can Be Weakened

`PUT /roles/admin` can change admin scopes from `*` to `read`. No protection for built-in role names.

### 13. Audit Chain Hash Omits Timestamp

Hash input is `prevId|prevHash|method|identity|action|secretKey` — no timestamp. An attacker with DB access could reorder entries without detection.

### 14. Auto-Provision Has No Domain Restriction

Any email passing Cloudflare Access gets auto-provisioned. No domain filter (e.g., `@company.com` only).

### 15. Missing Single-Quote Escaping in `esc()`

The HTML escape function handles `& < > "` but not `'`. Future use in single-quoted attributes could be exploitable.

### 16. Geo-Fence Leaks Country

Error message includes detected country: `"Access denied from US — geo-restricted"`. Reveals geo-fence rules.

### 17. Regex Pattern Reflected in Error

Secret name pattern is echoed back to the caller, revealing internal flag configuration.

---

## Verified Secure

These areas were audited and found correctly implemented:

- **SQL injection**: All D1 queries use parameterized `.bind()` — zero injection vectors across 15+ files
- **HMAC timing**: Uses `crypto.subtle.verify()` (constant-time) — no timing side channel
- **IV generation**: Fresh random 12-byte IV on every encryption — no reuse
- **JWT validation**: Complete issuer, audience, and algorithm verification via `jose`
- **Unregistered tokens**: Correctly rejected — valid Access JWT alone is insufficient
- **Route authorization**: Every secret route checks scope + tag access
- **Middleware ordering**: Public routes before auth boundary, protected routes after
- **Security headers**: HSTS, CSP, X-Content-Type-Options, X-Frame-Options all set
- **Key validation**: Both ENCRYPTION_KEY and INTEGRITY_KEY validate 64-char hex format
- **Envelope encryption**: Per-secret DEK with correct key wrapping
- **Geo-fencing**: Unknown country is denied (secure default)
- **Error handling**: Global handler returns generic "Internal error" to clients
