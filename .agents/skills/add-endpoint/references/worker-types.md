# Worker types and helpers

Source: `secret-vault/src/types.ts`, `secret-vault/src/crypto.ts`, `secret-vault/src/auth.ts`

## Bindings

```typescript
interface Env {
  DB: D1Database;
  FLAGS: KVNamespace;          // feature flags (plaintext key-value, not encrypted)
  ENCRYPTION_KEY: string;      // 64-char hex (32 bytes)
  INTEGRITY_KEY?: string;      // optional separate HMAC key (64-char hex, falls back to HKDF derivation)
  ALLOWED_EMAILS?: string;     // fallback if users table is empty (comma-separated)
  TEAM_DOMAIN: string;         // https://<team>.cloudflareaccess.com
  POLICY_AUD: string;          // Access application AUD tag
  PROJECT_NAME?: string;       // worker/DB name prefix (default: "secret-vault")
  BRAND_NAME?: string;         // display name in UI (default: "Secret Vault")
  REPO_URL?: string;           // GitHub repo URL for landing page links
  CORS_ORIGINS?: string;       // comma-separated allowed origins (empty = no CORS)
  ZT_CA_FINGERPRINT?: string;  // SHA-256 fingerprint of org's Zero Trust CA (hex, no colons)
  DEV_AUTH_BYPASS?: string;    // "true" in .dev.vars only - never set in production
}
```

## Auth types

```typescript
type PolicyRule = {
  scopes: string[];
  tags: string[];
};

type AuthUser = {
  method: "interactive" | "service_token";
  identity: string;       // email or client_id
  name: string;           // "owner" or registered token name
  role: string;           // role name (e.g. "admin", "operator", "reader")
  scopes: string[];       // ["*"] or ["read", "write", ...]
  allowedTags: string[];  // empty = all tags allowed (legacy, derived from policies)
  policies: PolicyRule[]; // policy-based RBAC rules
  warp?: { connected: boolean; ztVerified: boolean; deviceId?: string };
};

type HonoEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthUser;
    ip: string | null;
    ua: string | null;
    requestId: string;
    flags: Map<string, unknown>;
  };
};
```

## Crypto helpers

```typescript
encrypt(plaintext: string, hexKey: string): Promise<{ ciphertext: string; iv: string }>
decrypt(ciphertext: string, ivB64: string, hexKey: string): Promise<string>
```

Both use AES-256-GCM. `iv` is a random 12-byte nonce, base64-encoded for storage.

```typescript
computeHmac(key: string, ciphertext: string, iv: string, hexKey: string): Promise<string>
verifyHmac(key: string, ciphertext: string, iv: string, hmac: string, hexKey: string): Promise<boolean>
```

HMAC-SHA256 integrity binding. The HMAC key is derived from `ENCRYPTION_KEY` via HKDF (`crypto.subtle.deriveKey`), binding key name + ciphertext + IV. Computed on every write, verified on every read.

## Access helpers

```typescript
// Gate check: does ANY policy grant this scope (regardless of tags)?
hasScope(auth: AuthUser, required: string): boolean

// Resource check: does a policy grant this scope for this secret's tags?
hasAccess(auth: AuthUser, requiredScope: string, secretTags: string): boolean

// Collect all tags the user can access for a given scope (for SQL filtering). null = all tags.
accessibleTags(auth: AuthUser, requiredScope: string): string[] | null

// Check admin role
isAdmin(auth: AuthUser): boolean
```

Use `hasScope` as a gate check before a route, then `hasAccess` per-resource when iterating secrets. Import from `secret-vault/src/access.ts`.

## Audit helper

```typescript
audit(env: Env, auth: AuthUser, action: string, secretKey: string | null, ip: string | null, userAgent?: string | null, requestId?: string | null): Promise<void>
// Inserts into audit_log with hash-chain integrity. method is "interactive" or token name.
```

## API schemas

Zod schemas are split by domain: `schemas.ts` (common), `schemas-secrets.ts`, `schemas-tokens.ts`, `schemas-rbac.ts`. See the `zod-openapi` skill for patterns.

Routes use `createRoute()` + `app.openapi()` from `@hono/zod-openapi`. Request validation is automatic via Zod - use `c.req.valid("json")` and `c.req.valid("param")` instead of `c.req.json()`.

## Route context

After auth middleware, every handler has:
- `c.get("auth")` → `AuthUser`
- `c.get("ip")` → `string | null` (from `CF-Connecting-IP`)
- `c.get("ua")` → `string | null` (User-Agent)
- `c.get("requestId")` → `string` (X-Request-ID)
- `c.get("flags")` → `Map<string, unknown>` (feature flags)
- `c.req.valid("param")` → validated path params (via Zod)
- `c.req.valid("json")` → validated request body (via Zod)
- `c.env.DB` → D1 database
- `c.env.ENCRYPTION_KEY` → hex key for encrypt/decrypt
