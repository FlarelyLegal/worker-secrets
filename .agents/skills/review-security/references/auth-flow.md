# Authentication flow

Source: `secret-vault/src/auth.ts` — `authenticate()` function

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
4. Return scopes from the registration record

### Step 2b: Interactive path

If no `CF-Access-Client-Id` header:
1. Extract `email` from JWT payload
2. Compare against `ALLOWED_EMAILS` (case-insensitive)
3. If match → grant `["*"]` scopes as "owner"

### Rejection

Any of these returns `null` → middleware responds 401:
- Missing `Cf-Access-Jwt-Assertion` header
- Invalid/expired JWT signature
- Wrong issuer or audience
- Service token not registered in D1
- Email doesn't match `ALLOWED_EMAILS`

## Scope enforcement

After auth, individual routes check scopes:

```typescript
function hasScope(auth: AuthUser, required: string): boolean {
  return auth.scopes.includes("*") || auth.scopes.includes(required);
}
```

- Interactive users always have `["*"]`
- Service tokens have whatever was set at registration
- Token management and audit endpoints check `auth.method !== "interactive"` directly

## CLI auth (`hfs/src/config.ts`)

Two modes, no fallback:
- **Service token**: `HFS_CLIENT_ID` + `HFS_CLIENT_SECRET` env vars → sends as `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers
- **Interactive**: JWT from `hfs login` (via cloudflared) → sends as `CF_Authorization` cookie
- Partial env vars (one set, one missing) → hard error, not silent skip
