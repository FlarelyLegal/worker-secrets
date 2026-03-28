# Worker types and helpers

Source: `secret-vault/src/types.ts`, `secret-vault/src/crypto.ts`, `secret-vault/src/auth.ts`

## Bindings

```typescript
interface Env {
  DB: D1Database;
  ENCRYPTION_KEY: string;   // 64-char hex (32 bytes)
  ALLOWED_EMAILS: string;   // comma-separated emails for interactive sessions
  TEAM_DOMAIN: string;      // https://<team>.cloudflareaccess.com
  POLICY_AUD: string;       // Access application AUD tag
}
```

## Auth types

```typescript
type AuthUser = {
  method: "interactive" | "service_token";
  identity: string;     // email or client_id
  name: string;         // "owner" or registered token name
  scopes: string[];     // ["*"] or ["read", "write", ...]
};

type HonoEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthUser;
    ip: string | null;
  };
};
```

## Crypto helpers

```typescript
encrypt(plaintext: string, hexKey: string): Promise<{ ciphertext: string; iv: string }>
decrypt(ciphertext: string, ivB64: string, hexKey: string): Promise<string>
```

Both use AES-256-GCM. `iv` is a random 12-byte nonce, base64-encoded for storage.

## Auth helper

```typescript
hasScope(auth: AuthUser, required: string): boolean
// Returns true if auth.scopes includes "*" or the required scope
```

## Audit helper

```typescript
audit(env: Env, auth: AuthUser, action: string, secretKey: string | null, ip: string | null): Promise<void>
// Inserts into audit_log. method is "interactive" or token name.
```

## API schemas

All Zod schemas live in `secret-vault/src/schemas.ts`. See the `zod-openapi` skill for patterns.

Routes use `createRoute()` + `app.openapi()` from `@hono/zod-openapi`. Request validation is automatic via Zod — use `c.req.valid("json")` and `c.req.valid("param")` instead of `c.req.json()`.

## Route context

After auth middleware, every handler has:
- `c.get("auth")` → `AuthUser`
- `c.get("ip")` → `string | null` (from `CF-Connecting-IP`)
- `c.req.valid("param")` → validated path params (via Zod)
- `c.req.valid("json")` → validated request body (via Zod)
- `c.env.DB` → D1 database
- `c.env.ENCRYPTION_KEY` → hex key for encrypt/decrypt
