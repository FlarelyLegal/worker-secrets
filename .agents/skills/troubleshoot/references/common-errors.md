# Common errors catalog

## Worker errors

| Error | Status | Cause | Fix |
|-------|--------|-------|-----|
| `{"error":"Unauthorized"}` | 401 | Missing/invalid/expired JWT, or unregistered service token | `hfs login`, or register the token with `hfs token register` |
| `{"error":"Insufficient scope"}` | 403 | Service token doesn't have the required scope | Re-register with `-s read,write` or `-s '*'` |
| `{"error":"Owner only"}` | 403 | Service token tried to access `/tokens` or `/audit` | These endpoints require interactive auth only |
| `{"error":"Secret not found"}` | 404 | Key doesn't exist | Check key spelling, run `hfs ls` |
| `{"error":"Token not found"}` | 404 | Client ID not in service_tokens table | Check `hfs token ls` |
| `{"error":"name is required"}` | 400 | PUT /tokens without `name` in body | Pass `-n <name>` in CLI |
| `{"error":"value is required"}` | 400 | PUT /secrets without `value` in body | Pass value as argument or `--from-stdin`/`--from-file` |
| `{"error":"\"export\" is a reserved key name"}` | 400 | PUT /secrets/export | Use a different key name |
| `{"error":"Invalid scope: X"}` | 400 | Unrecognized scope string | Valid: `read`, `write`, `delete`, `*` |
| `{"error":"Encryption failed"}` | 500 | `ENCRYPTION_KEY` invalid or crypto error | Verify key is 64-char hex |
| `{"error":"Decryption failed"}` | 500 | Secret encrypted with a different key or corrupted | Verify `ENCRYPTION_KEY` matches |
| `{"error":"Internal error"}` | 500 | Unhandled exception (D1 down, unexpected state) | Check `wrangler tail` for stack trace |

## CLI errors

| Error | Cause | Fix |
|-------|-------|-----|
| `error: Vault URL not configured` | No URL in config or env | `hfs config set --url <url>` or `export HFS_URL=...` |
| `error: Not authenticated` | No JWT stored | `hfs login` |
| `error: Session expired at <date>` | JWT past expiry | `hfs login` |
| `error: Incomplete service token config` | One of HFS_CLIENT_ID/HFS_CLIENT_SECRET missing | Set both env vars |
| `error: cloudflared not found` | cloudflared not installed | Install from cloudflare docs |
| `error: cloudflared login failed` | Browser auth failed or timed out | Try again, check network |
| `error: Invalid JWT format` | cloudflared returned non-JWT | Check cloudflared version, try `cloudflared update` |
| `error: HTTP 502` or network error | Worker not deployed or DNS not configured | `npm run deploy`, check custom domain |

## D1 errors (in wrangler tail)

| Error | Cause | Fix |
|-------|-------|-----|
| `no such table: secrets` | Migrations not applied | `npm run db:migrate` |
| `no such table: service_tokens` | Migrations not applied | `npm run db:migrate` |
| `UNIQUE constraint failed` | Duplicate primary key | Expected for upserts (ON CONFLICT handles it) |
| `database_id is required` | Empty database_id in wrangler.jsonc | Run `npm run db:create`, copy ID to wrangler.jsonc |

## Crypto errors (in wrangler tail)

| Error | Cause | Fix |
|-------|-------|-----|
| `OperationError` from decrypt | Wrong ENCRYPTION_KEY or corrupted ciphertext | Verify key matches what was used to encrypt |
| `The provided data is too small` | Truncated ciphertext in D1 | Data corruption — restore from backup |
| `Invalid keyData` from importKey | ENCRYPTION_KEY is not valid 64-char hex | Regenerate with `npm run generate-keys` |
