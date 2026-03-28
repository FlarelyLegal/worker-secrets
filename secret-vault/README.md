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
| `GET` | `/secrets/export` | interactive | Export all decrypted |
| `PUT` | `/secrets/{key}` | write | Create or update |
| `DELETE` | `/secrets/{key}` | delete | Delete |
| `GET` | `/audit` | interactive | Audit log |
| `GET` | `/tokens` | interactive | List service tokens |
| `PUT` | `/tokens/{clientId}` | interactive | Register token |
| `DELETE` | `/tokens/{clientId}` | interactive | Revoke token |

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

## Security

- **Encryption at rest**: AES-256-GCM, per-secret random IV
- **Dual auth**: Access validates at edge, Worker validates again as defense-in-depth
- **Hardware key enforcement**: Interactive policy requires `hwk` (FIDO2/passkey/YubiKey)
- **Registered tokens only**: Valid Access token is rejected until registered with name + scopes
- **Full audit log**: Every operation logged with identity, action, key, IP, timestamp
- **Zod validation**: All inputs validated via OpenAPI schemas
