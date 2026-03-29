# Secret Vault

Encrypted secret management for Cloudflare Workers — a self-hosted vault with CLI.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-6BA539?logo=openapiinitiative&logoColor=white)](https://www.openapis.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![skill: cloudflare-workers](https://img.shields.io/badge/skill-cloudflare--workers-5D5CDE)](.agents/skills/cloudflare-workers/SKILL.md)
[![skill: zod-openapi](https://img.shields.io/badge/skill-zod--openapi-5D5CDE)](.agents/skills/zod-openapi/SKILL.md)
[![skill: deploy](https://img.shields.io/badge/skill-deploy-5D5CDE)](.agents/skills/deploy/SKILL.md)
[![skill: review-security](https://img.shields.io/badge/skill-review--security-5D5CDE)](.agents/skills/review-security/SKILL.md)

AES-256-GCM encryption at rest with HMAC-SHA256 integrity binding in D1. Dual auth via Cloudflare Access with any IdP (optionally with hardware keys), or registered service tokens with named identities and scoped permissions. Role-based access control with admin, operator, and reader roles. Every operation audit-logged with request tracing.

## Security

- **Envelope encryption** — per-secret DEK wrapped by a master KEK, enabling key rotation without re-encrypting every secret (backwards compatible with legacy single-key secrets)
- **AES-256-GCM** encryption with unique random IV per secret
- **HMAC-SHA256** integrity binding — every secret cryptographically bound to its key name, tamper-evident at rest
- **RBAC** — users and service tokens assigned to roles with scoped permissions (admin, operator, reader, custom)
- **Dual auth** — Cloudflare Access validates at edge, Worker validates again as defense-in-depth
- **Hardware key support** — Access policy can require FIDO2/passkey/YubiKey for interactive sessions
- **Registered tokens only** — valid Access tokens are rejected until registered with name and scopes
- **User management** — add, disable, or reassign roles without redeploying
- **Auto-seed** — first login on a fresh deploy becomes admin automatically
- **Full audit trail** — every operation logged with identity, IP, user agent, and request ID; hash-chained (`prev_hash`) for tamper-evident history
- **Zod validation** — all inputs validated via OpenAPI schemas with size limits

## Packages

| Package | What | Docs |
|---------|------|------|
| [`secret-vault/`](secret-vault/) | Cloudflare Worker API | [README](secret-vault/README.md) |
| [`hfs/`](hfs/) | CLI for humans and scripts | [README](hfs/README.md) |

## Quick start

**1. Deploy the Worker** — see [secret-vault/README.md](secret-vault/README.md)

**2. Install the CLI**

```bash
npm install -g @FlarelyLegal/hfs-cli --registry=https://npm.pkg.github.com
```

**3. Use it**

```bash
hfs set api-key sk-ant-...         # store a secret
hfs get api-key -q                 # retrieve (pipe-friendly)
hfs ls                             # list keys
eval $(hfs env -e API_KEY)         # load into shell
hfs flag set maintenance true      # set a feature flag
hfs token register abc.access \
  --name ci-pipeline --scopes read # register a service token
hfs audit                          # who accessed what
```

## Development

```bash
# Lint
npm run lint

# Type-check
cd secret-vault && npx tsc --noEmit
cd hfs && npx tsc --noEmit

# Test
cd secret-vault && npm test
cd hfs && npm test
```

## OpenAPI

API spec auto-generated at `/doc` from Zod schemas. Every endpoint is validated and documented.

## Changelog

Generated from commits via [git-cliff](https://git-cliff.org/): `npm run changelog`
