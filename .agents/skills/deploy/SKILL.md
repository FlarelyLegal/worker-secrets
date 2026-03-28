---
name: deploy
description: Deploy the secret-vault Cloudflare Worker and run pending D1 migrations. Use when deploying changes, after modifying the Worker source or adding migrations.
---

# Deploy

## CONVENTIONS

- **ALWAYS** type-check before deploying: `cd secret-vault && npx tsc --noEmit`
- **ALWAYS** run `npm run sync-version` before publishing the CLI
- **ALWAYS** apply D1 migrations before deploying if new migration files exist
- **ALWAYS** verify deployment with `/health` endpoint
- **NEVER** deploy without type-checking and linting first

## DEPLOY THE WORKER

```bash
# 1. Type-check
cd secret-vault && npx tsc --noEmit

# 2. Apply migrations (if any new files in migrations/)
npm run db:migrate

# 3. Deploy
npm run deploy

# 4. Verify
curl https://secrets.homeflare.dev/health

# 5. Tail logs for errors
wrangler tail
```

Verify D1 migrations via `d1_database_query` MCP tool:
```sql
SELECT name FROM sqlite_master WHERE type='table'
```

## PUBLISH THE CLI

```bash
# 1. Sync version from root VERSION file
npm run sync-version

# 2. Build and publish
cd hfs
npm run build
npm publish
```

## FIRST-TIME PREREQUISITES

- `wrangler secret put ENCRYPTION_KEY` (64-char hex, generate with `npm run generate-keys`)
- `database_id` filled in `wrangler.jsonc` (from `npm run db:create`)
- `"vars"` in `wrangler.jsonc`: `ALLOWED_EMAILS`, `TEAM_DOMAIN`, `POLICY_AUD`
- Cloudflare Access application created with correct domain and policies
- Custom domain or route configured to match Access application domain
