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

1. **Service Auth** - Include: your service token
2. **Allow** - Include: allowed emails. Require: `hwk` (hardware key)

`hfs deploy` scaffolds both the Allow and Service Auth policies automatically. Copy the **Application Audience (AUD) Tag** into `POLICY_AUD`.

## Endpoints

Interactive API docs at [`/doc`](https://secrets.homeflare.dev/doc). Raw OpenAPI JSON at [`/doc/json`](https://secrets.homeflare.dev/doc/json).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | none | Health check |
| `GET` | `/doc` | none | Scalar API reference UI |
| `GET` | `/doc/json` | none | OpenAPI 3.0 spec (JSON) |
| `GET` | `/whoami` | any | Auth status |
| `GET` | `/secrets` | read | List keys (no values) |
| `GET` | `/secrets/{key}` | read | Get decrypted secret |
| `GET` | `/secrets/{key}/versions` | read | Version history |
| `GET` | `/secrets/{key}/versions/{id}` | read | Get decrypted version value |
| `POST` | `/secrets/{key}/versions/{id}/restore` | write | Restore a previous version |
| `GET` | `/secrets/export` | interactive | Export all decrypted |
| `POST` | `/secrets/import` | interactive | Bulk import from JSON |
| `PUT` | `/secrets/{key}` | write | Create or update |
| `DELETE` | `/secrets/{key}` | delete | Delete |
| `POST` | `/admin/re-encrypt` | admin | Migrate legacy secrets to envelope encryption |
| `POST` | `/admin/rotate-key` | admin | Re-wrap all DEKs with a new master key |
| `GET` | `/audit` | admin | Audit log |
| `GET` | `/tokens` | admin | List service tokens |
| `PUT` | `/tokens/{clientId}` | admin | Register token |
| `DELETE` | `/tokens/{clientId}` | admin | Revoke token |
| `GET` | `/users` | admin | List all users |
| `PUT` | `/users/{email}` | admin | Add or update a user |
| `PATCH` | `/users/{email}` | admin | Partial update (role, name, enabled) |
| `DELETE` | `/users/{email}` | admin | Remove a user |
| `GET` | `/roles` | admin | List all roles |
| `PUT` | `/roles/{name}` | admin | Create or update a role |
| `PATCH` | `/roles/{name}` | admin | Partial update (scopes, description, allowed_tags) |
| `DELETE` | `/roles/{name}` | admin | Delete a role (must have no users) |
| `GET` | `/roles/{name}/policies` | admin | List policies for a role |
| `PUT` | `/roles/{name}/policies` | admin | Replace all policies for a role |
| `GET` | `/flags` | read | List all feature flags |
| `GET` | `/flags/{key}` | read | Get a flag value |
| `PUT` | `/flags/{key}` | admin | Set a flag (auto-detects type) |
| `DELETE` | `/flags/{key}` | admin | Delete a flag |

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

Service Bindings are not supported - auth requires a valid Access JWT.

## Feature flags

22 runtime flags stored in KV (not encrypted). See [Feature Flags Reference](../docs/feature-flags.md) for the full list with defaults and behavior notes.

## Security

Envelope encryption (per-secret DEK + master KEK), HMAC-SHA256 integrity binding, dual auth via Cloudflare Access, RBAC with tag-based restrictions, and tamper-evident hash-chained audit logging.

See [Encryption Architecture](../docs/encryption.md) for detailed diagrams and [Threat Model](../SECURITY.md) for the hardening guide.
