# Contributing

Thank you for your interest in contributing to Secret Vault.

## Setup

```bash
git clone https://github.com/FlarelyLegal/worker-secrets.git
cd worker-secrets

# Root (linter)
npm install

# Worker
cd secret-vault && npm install

# CLI
cd ../hfs && npm install
```

## Development

```bash
# Worker local dev
cd secret-vault
cp .dev.vars.example .dev.vars   # fill in values
npm run db:migrate:local
npm run dev                       # http://localhost:8787

# CLI development
cd hfs
npm run build                     # or: npm run dev (watch mode)
npm link                          # global `hfs` command
```

## Checks

Run all of these before submitting a PR:

```bash
# From repo root
npm run lint                      # Biome lint + format

# Type-check both packages
cd secret-vault && npx tsc --noEmit
cd ../hfs && npx tsc --noEmit

# Tests
cd secret-vault && npm test
cd ../hfs && npm test

# Build CLI
cd ../hfs && npm run build
```

## Project structure

| Directory | What |
|-----------|------|
| `secret-vault/src/` | Worker API (Hono + OpenAPI) |
| `secret-vault/src/services/` | Core business logic (extracted from route handlers) |
| `secret-vault/src/rpc.ts` | WorkerEntrypoint for Service Binding RPC |
| `hfs/src/commands/` | CLI commands |
| `hfs/src/deploy/` | Deploy pipeline |
| `.agents/skills/` | Agent skills (coding conventions) |

## Conventions

- All files under 250 lines
- Separation of concerns over convenience
- Zod schemas for all API validation (see `zod-openapi` skill)
- `createRoute()` + `app.openapi()` for all endpoints
- Biome for linting and formatting
- Single source of truth: `VERSION` file for versions, deploy state for config

## Pull requests

- One concern per PR
- Include the issue number if applicable
- All checks must pass (CI runs automatically)
- Update relevant skills/docs if behavior changes

## Security

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/FlarelyLegal/worker-secrets/security/advisories/new).
