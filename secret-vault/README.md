# Secret Vault

Cloudflare Worker API for encrypted secret management with dual auth.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Zod](https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white)](https://zod.dev/)
[![OpenAPI 3.0](https://img.shields.io/badge/OpenAPI-3.0-6BA539?logo=openapiinitiative&logoColor=white)](https://www.openapis.org/)

[![skill: cloudflare-workers](https://img.shields.io/badge/skill-cloudflare--workers-5D5CDE)](../.agents/skills/cloudflare-workers/SKILL.md)
[![skill: zod-openapi](https://img.shields.io/badge/skill-zod--openapi-5D5CDE)](../.agents/skills/zod-openapi/SKILL.md)
[![skill: add-endpoint](https://img.shields.io/badge/skill-add--endpoint-5D5CDE)](../.agents/skills/add-endpoint/SKILL.md)
[![skill: add-migration](https://img.shields.io/badge/skill-add--migration-5D5CDE)](../.agents/skills/add-migration/SKILL.md)
[![skill: review-security](https://img.shields.io/badge/skill-review--security-5D5CDE)](../.agents/skills/review-security/SKILL.md)

## Setup

```bash
npm install
npm run db:create                # copy database_id into wrangler.jsonc
npm run generate-keys            # then: wrangler secret put ENCRYPTION_KEY
```

Uncomment and fill `"vars"` in `wrangler.jsonc`: `ALLOWED_EMAILS`, `TEAM_DOMAIN`, `POLICY_AUD`.

```bash
npm run db:migrate
npm run deploy
```

## Cloudflare Access

Create an Access application for your domain with two policies (order matters):

1. **Service Auth** — Include: your service token
2. **Allow** — Include: allowed emails. Require: `hwk` (hardware key)

Copy the **Application Audience (AUD) Tag** into `POLICY_AUD`.

## Endpoints

Interactive API docs at [`/doc`](https://vault.example.com/doc). Raw OpenAPI JSON at [`/doc/json`](https://vault.example.com/doc/json).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | none | Health check |
| `GET` | `/doc` | none | Scalar API reference UI |
| `GET` | `/doc/json` | none | OpenAPI 3.0 spec (JSON) |
| `GET` | `/whoami` | any | Auth status |
| `GET` | `/secrets` | read | List keys (no values) |
| `GET` | `/secrets/{key}` | read | Get decrypted secret |
| `GET` | `/secrets/{key}/versions` | read | Version history |
| `POST` | `/secrets/{key}/versions/{id}/restore` | write | Restore a previous version |
| `GET` | `/secrets/export` | interactive | Export all decrypted |
| `POST` | `/secrets/import` | interactive | Bulk import from JSON |
| `PUT` | `/secrets/{key}` | write | Create or update |
| `DELETE` | `/secrets/{key}` | delete | Delete |
| `GET` | `/audit` | interactive | Audit log |
| `GET` | `/tokens` | interactive | List service tokens |
| `PUT` | `/tokens/{clientId}` | interactive | Register token |
| `DELETE` | `/tokens/{clientId}` | interactive | Revoke token |
| `GET` | `/users` | admin | List all users |
| `PUT` | `/users/{email}` | admin | Add or update a user |
| `PATCH` | `/users/{email}` | admin | Partial update (role, name, enabled) |
| `DELETE` | `/users/{email}` | admin | Remove a user |
| `GET` | `/roles` | admin | List all roles |
| `PUT` | `/roles/{name}` | admin | Create or update a role |
| `PATCH` | `/roles/{name}` | admin | Partial update (scopes, description) |
| `DELETE` | `/roles/{name}` | admin | Delete a role (must have no users) |
| `GET` | `/flags` | read | List all feature flags |
| `GET` | `/flags/{key}` | read | Get a flag value |
| `PUT` | `/flags/{key}` | write | Set a flag (auto-detects type) |
| `DELETE` | `/flags/{key}` | delete | Delete a flag |

## Using from other Workers

```typescript
const res = await fetch("https://vault.example.com/secrets/api-key", {
  headers: {
    "CF-Access-Client-Id": env.VAULT_CLIENT_ID,
    "CF-Access-Client-Secret": env.VAULT_CLIENT_SECRET,
  },
});
const { value } = await res.json();
```

Service Bindings are not supported — auth requires a valid Access JWT.

## Feature flags

Flags are stored in a `FLAGS` KV namespace as plaintext key-value pairs (not encrypted in D1 like secrets). Each flag stores its value, type, description, and provenance (`updated_by`, `updated_at`). Types are auto-detected: `"true"`/`"false"` become boolean, numeric strings become number, valid JSON objects become json, everything else is string. All flag operations are audit-logged.

## Security

- **Envelope encryption**: per-secret DEK wrapped by a master KEK, enabling key rotation via DEK re-encryption (backwards compatible with legacy single-key secrets)
- **Encryption at rest**: AES-256-GCM with per-secret random IV (PQC-safe symmetric)
- **HMAC integrity**: HMAC-SHA256 binds each secret to its key name via HKDF-derived key (or optional `INTEGRITY_KEY`), detecting tampering or ciphertext swaps at rest
- **Tag-based access control**: roles can restrict access to secrets matching specific tags via `allowed_tags`
- **Secret expiry tracking**: optional `expires_at` per secret, settable via `--expires` flag
- **Dual auth**: Access validates at edge, Worker validates again as defense-in-depth
- **RBAC**: Users and service tokens assigned to roles (admin, operator, reader) with scoped permissions
- **Hardware key support**: Access policy can require `hwk` (FIDO2/passkey/YubiKey) for interactive sessions
- **Registered tokens only**: Valid Access token is rejected until registered with name + scopes
- **Full audit log**: Every operation logged with identity, action, key, IP, user agent; hash-chained (`prev_hash`) for tamper-evident history
- **Zod validation**: All inputs validated via OpenAPI schemas with size limits
