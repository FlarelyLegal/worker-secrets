# Secret Vault

Self-hosted encrypted secret manager on Cloudflare Workers. No external dependencies, no third-party trust — runs entirely on your own account.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-6BA539?logo=openapiinitiative&logoColor=white)](https://www.openapis.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Store API keys, tokens, certificates, and credentials with a CLI or REST API. Every secret is envelope-encrypted with its own key, integrity-bound via HMAC, and access-controlled through role-based permissions with tag-level restrictions. Every operation is audit-logged in a tamper-evident hash chain.

## Why

- **Zero trust in third parties** — your secrets never leave your Cloudflare account
- **Defense in depth** — Cloudflare Access at the edge, Worker-level JWT validation, registered token enforcement, RBAC with per-secret tag restrictions
- **Encryption done right** — envelope encryption (per-secret DEK + master KEK), HMAC integrity binding, optional separate integrity key
- **Operational control** — 13 runtime feature flags, version history with restore, secret expiry tracking, user management — all without redeploying

## Security

| Layer | What |
|-------|------|
| **Encryption** | AES-256-GCM envelope encryption — each secret gets its own DEK, wrapped by a master KEK. Key rotation via DEK re-encryption. |
| **Integrity** | HMAC-SHA256 binds each secret to its key name. Optional separate `INTEGRITY_KEY`. Tamper-evident at rest. |
| **Auth** | Dual-path via Cloudflare Access: interactive (IdP + optional hardware keys) or registered service tokens. |
| **RBAC** | Users and tokens assigned to roles (admin, operator, reader, custom). Tag-based restrictions limit which secrets a role can access. |
| **Audit** | Every operation logged with identity, IP, user agent, request ID. SHA-256 hash-chained for tamper detection. |
| **Lifecycle** | Version history with restore, expiry tracking, 13 feature flags for runtime control. |

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
hfs set api-key sk-ant-... -t production    # store with tags
hfs get api-key -q                          # retrieve (pipe-friendly)
hfs ls                                      # list keys
eval $(hfs env -e API_KEY DB_PASSWORD)      # load into shell
hfs user add ops@company.com -r operator    # add a user
hfs role set ci-reader read --allowed-tags ci  # tag-restricted role
hfs token register abc.access -n ci -r ci-reader  # scoped service token
hfs versions api-key                        # view history
hfs audit --action set --from 2026-03-01    # filtered audit log
```

## Development

```bash
npm run lint                    # Biome check
cd secret-vault && npm test     # 36 Worker tests
cd hfs && npm test              # CLI tests
```

## OpenAPI

API spec auto-generated at `/doc` from Zod schemas. Interactive Scalar UI. Every endpoint is validated and documented.

## Changelog

Generated from commits via [git-cliff](https://git-cliff.org/): `npm run changelog`
