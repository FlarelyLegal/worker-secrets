---
name: local-dev
description: Set up and run local development for the secret-vault Worker and hfs CLI. Use when starting development, running locally, or onboarding.
---

# Local development

## PREREQUISITES

- Node.js 20+
- npm
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (for `hfs login`)
- Wrangler (`npx wrangler` or `npm i -g wrangler`)

## WORKER

```bash
cd secret-vault
npm install

# Create local D1 and apply migrations
npm run db:migrate:local

# Generate encryption key and add to .dev.vars
npm run generate-keys

# Copy .dev.vars.example and fill in values (or create from scratch)
cp .dev.vars.example .dev.vars
# Edit .dev.vars - set ENCRYPTION_KEY, ALLOWED_EMAILS, TEAM_DOMAIN, POLICY_AUD
# Set DEV_AUTH_BYPASS = "true" to skip Access auth locally

# Start local Worker at http://localhost:8787
npm run dev
```

**Auth bypass:** Set `DEV_AUTH_BYPASS = "true"` in `.dev.vars` to skip Cloudflare Access auth locally. This is gitignored and cannot reach production. Without it, all requests return 401 (no Access JWT available locally).

For testing against **real Access auth**, use `wrangler dev --remote`.

## CLI

```bash
cd hfs
npm install
npm run build     # or: npm run dev (watch mode)
npm link          # link for local testing

hfs config set --url http://localhost:8787
```

## LOCAL D1 QUERIES

```bash
wrangler d1 execute secret-vault-db --local --command "SELECT key FROM secrets"
wrangler d1 execute secret-vault-db --local --command "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 10"
```
