# Authentication flow

Source: `secret-vault/src/auth.ts` - `authenticate()` function

## Overview

All requests pass through Cloudflare Access before reaching the Worker. Access sets the `Cf-Access-Jwt-Assertion` header with a signed JWT. The Worker validates this JWT as defense-in-depth.

## Flow

```
Request → Cloudflare Access → Worker auth middleware → Route handler
```

### Step 1: JWT validation

```typescript
const token = request.headers.get("Cf-Access-Jwt-Assertion");
const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
const result = await jwtVerify(token, JWKS, {
  issuer: env.TEAM_DOMAIN,
  audience: env.POLICY_AUD,
});
```

- Verifies signature against Cloudflare's JWKS endpoint
- Checks issuer matches `TEAM_DOMAIN`
- Checks audience matches `POLICY_AUD` (this specific Access application)
- Rejects expired tokens

### Step 2a: Service token path

If `CF-Access-Client-Id` header is present:
1. Look up `client_id` in `service_tokens` table
2. If not registered → reject (401), even if the Access token itself is valid
3. Update `last_used_at` timestamp
4. If token has a `role` set → resolve scopes from `roles` table (overrides raw scopes)
5. Otherwise → use raw `scopes` from the registration record
6. Return `AuthUser` with `method: "service_token"`, resolved scopes

### Step 2b: Interactive path

If no `CF-Access-Client-Id` header:
1. Extract `email` from JWT payload
2. Look up email in `users` table (case-insensitive)
3. If found and `enabled = 1` → resolve scopes from user's role via `roles` table, update `last_login_at`
4. If found and `enabled = 0` → reject (user disabled)
5. If not found and `users` table is empty → **auto-seed** as admin (self-bootstrapping)
6. If not found → fall back to `ALLOWED_EMAILS` env var (migration path for existing deployments)

### Rejection

Any of these returns `null` → middleware responds 401:
- Missing `Cf-Access-Jwt-Assertion` header
- Invalid/expired JWT signature
- Wrong issuer or audience
- Service token not registered in D1
- User not in `users` table (and not in `ALLOWED_EMAILS` fallback)
- User disabled (`enabled = 0`)

Failed auth attempts are logged to audit_log with `method: "rejected"`, `action: "auth_failed"`, and `request_id`.

### DEV_AUTH_BYPASS

When `DEV_AUTH_BYPASS` is set in the environment and the request has no `CF-Connecting-IP` header (i.e., local development, not production edge), authentication is bypassed with a synthetic admin identity. This must never be set in production.

## RBAC scope resolution

Scopes are resolved from the user's role, not hardcoded:

```typescript
async function resolveScopes(db: D1Database, role: string): Promise<string[]> {
  const row = await db.prepare("SELECT scopes FROM roles WHERE name = ?").bind(role).first();
  if (!row) return ["read"]; // safe fallback
  return row.scopes === "*" ? ["*"] : row.scopes.split(",").map(s => s.trim());
}
```

Default roles: `admin` (`*`), `operator` (`read,write`), `reader` (`read`).

## Scope enforcement

After auth, individual routes use two checks from `secret-vault/src/access.ts`:

```typescript
// Gate check: does ANY policy grant this scope (regardless of tags)?
function hasScope(auth: AuthUser, required: string): boolean {
  return auth.policies.some((p) => p.scopes.includes("*") || p.scopes.includes(required));
}

// Resource check: does a policy grant this scope for this secret's tags?
function hasAccess(auth: AuthUser, requiredScope: string, secretTags: string): boolean {
  return auth.policies.some((p) => {
    const scopeOk = p.scopes.includes("*") || p.scopes.includes(requiredScope);
    if (!scopeOk) return false;
    if (p.tags.length === 0) return true; // unrestricted policy
    if (!secretTags) return false;        // restricted policy, untagged secret
    return p.tags.some((t) => secretTags.split(",").map(s => s.trim()).includes(t));
  });
}
```

Use `hasScope` at the route level, `hasAccess` per-resource when filtering secrets by tag.

## Admin enforcement

User and role management endpoints require both interactive auth AND admin role:

```typescript
function isAdmin(auth: AuthUser): boolean {
  return auth.role === "admin";
}
```

## CLI auth (`hfs/src/config.ts`)

Two modes, no fallback:
- **Service token**: `HFS_CLIENT_ID` + `HFS_CLIENT_SECRET` env vars → sends as `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers
- **Interactive**: JWT from `hfs login` (via cloudflared) → sends as both `CF_Authorization` cookie and `Cf-Access-Jwt-Assertion` header
- Partial env vars (one set, one missing) → hard error, not silent skip
