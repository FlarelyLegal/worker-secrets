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

AES-256-GCM encryption at rest in D1. Dual auth via Cloudflare Access — interactive (IdP + hardware key) or registered service tokens with named identities, scoped permissions, and full audit logging.

## Packages

| Package | What | Docs |
|---------|------|------|
| [`secret-vault/`](secret-vault/) | Cloudflare Worker API | [README](secret-vault/README.md) |
| [`hfs/`](hfs/) | CLI for humans and scripts | [README](hfs/README.md) |

## Quick start

**1. Deploy the Worker** — see [secret-vault/README.md](secret-vault/README.md)

**2. Install the CLI** — see [hfs/README.md](hfs/README.md)

**3. Use it**

```bash
hfs set api-key sk-ant-...         # store a secret
hfs get api-key -q                 # retrieve (pipe-friendly)
hfs ls                             # list keys
eval $(hfs env -e API_KEY)         # load into shell
hfs token register abc.access \
  --name ci-pipeline --scopes read # register a service token
hfs audit                          # who accessed what
```

## OpenAPI

API spec auto-generated at `/doc` from Zod schemas. Every endpoint is validated and documented.

## Changelog

Generated from commits via [git-cliff](https://git-cliff.org/): `npm run changelog`
