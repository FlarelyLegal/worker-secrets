---
name: troubleshoot
description: Diagnose and fix issues with the secret-vault Worker, hfs CLI, D1 database, Cloudflare Access auth, and encryption. Use when something is broken, returning errors, or behaving unexpectedly.
---

# Troubleshoot

## QUICK DIAGNOSIS

1. **Worker up?** `curl https://vault.example.com/health` → `{"status":"ok","database":"ok"}`
2. **Auth working?** `hfs whoami` → method, identity, scopes
3. **D1 reachable?** `hfs ls` → if hangs, D1 binding misconfigured
4. **CLI configured?** `hfs config show` → URL, session status, active auth

## COMMON ISSUES

### Worker 401 Unauthorized
- JWT expired → `hfs login`
- Service token not registered → `hfs token register <id> -n <name>`
- `POLICY_AUD` or `TEAM_DOMAIN` mismatch in wrangler.jsonc vars
- Access application domain doesn't match Worker route

### Worker 500 Internal Server Error
- `ENCRYPTION_KEY` not set → `wrangler secret put ENCRYPTION_KEY`
- `ENCRYPTION_KEY` wrong format (must be 64-char hex)
- D1 database not created or `database_id` empty in `wrangler.jsonc`
- Migrations not applied → `npm run db:migrate`
- D1 unreachable or binding misconfigured

### Worker 403 Forbidden
- Service token missing required scope → re-register with correct `-s` flag
- Trying to access `/tokens` or `/audit` with a service token (interactive only)

### CLI errors
- "Vault URL not configured" → `hfs config set --url <url>` or set `HFS_URL`
- "Session expired" → `hfs login`
- "cloudflared not found" → install cloudflared
- "Incomplete service token config" → set BOTH `HFS_CLIENT_ID` and `HFS_CLIENT_SECRET`

### Crypto
- "Decryption failed" → `ENCRYPTION_KEY` changed since secrets were stored
- "Encryption failed" → `ENCRYPTION_KEY` invalid format
- No key rotation support — changing the key makes all existing secrets unreadable

See [common errors](references/common-errors.md) for the full error catalog.

## DEBUGGING TOOLS

### MCP tools (prefer over shell)

- `d1_database_query` — `SELECT key FROM secrets`, `SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 10`
- `search_cloudflare_documentation` — D1 limits, Workers APIs, Access JWT format
- `workers_list` / `workers_get_worker` — verify deployment state
- `d1_databases_list` — confirm database exists

### Shell

```bash
wrangler tail                     # Live Worker logs
cd secret-vault && npm run dev    # Local dev
echo $JWT | cut -d. -f2 | base64 -d | jq .  # Inspect JWT claims
```

## KNOWN LIMITATIONS

- No rate limiting — Cloudflare's edge DDoS protection only
- `"export"` and `"import"` are reserved secret key names (collide with `/secrets/export` and `/secrets/import` routes)
- X-Request-ID header on every response for debugging
