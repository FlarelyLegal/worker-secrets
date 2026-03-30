# Feature Flags

Runtime configuration stored in Cloudflare KV. All flags are plaintext (not encrypted). Changes take effect on the next request - no redeploy needed.

## Managing flags

```bash
hfs flag ls                    # List all flags with current values
hfs flag get <key>             # Get a flag value
hfs flag set <key> <value>     # Set a flag (auto-detects type)
hfs flag rm <key>              # Delete a flag (reverts to default)
```

Flag mutations require **admin** role. Reading flags requires **read** scope.

## Flag reference

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `maintenance` | boolean | `false` | Returns 503 for all authenticated requests. Checked before auth - blocks everyone. |
| `read_only` | boolean | `false` | Rejects PUT, POST, DELETE after auth. Read operations still work. |
| `disable_export` | boolean | `false` | Blocks `GET /secrets/export`. Individual get still works. |
| `require_description` | boolean | `false` | Rejects `PUT /secrets/{key}` if description is empty. |
| `require_tags` | boolean | `false` | Rejects `PUT /secrets/{key}` if tags are empty. |
| `hmac_required` | boolean | `false` | Rejects reads of secrets missing an HMAC integrity tag. Useful after full re-encrypt. |
| `max_secrets` | number | `0` (unlimited) | Maximum number of secrets allowed. New keys rejected when limit is reached. |
| `versioning_enabled` | boolean | `true` | Archive previous value before overwrite. Disable to save storage. |
| `max_versions` | number | `0` (unlimited) | Maximum versions per secret. Oldest pruned on write when exceeded. |
| `audit_retention_days` | number | `90` | Audit entries older than this are eligible for background cleanup. |
| `audit_cleanup_probability` | number | `0.01` | Probability (0–1) that a request triggers background audit cleanup. |
| `allowed_emails_role` | string | `"reader"` | Role assigned to users matching `ALLOWED_EMAILS` env var (fallback path). |
| `public_pages_enabled` | boolean | `true` | Controls visibility of `/`, `/doc`, and `/doc/json`. Set to `false` to hide public pages. |
| `enforce_expiry` | boolean | `false` | Rejects reads of expired secrets with 403. Secrets with `expires_at` in the past are blocked. |
| `burn_after_reading` | boolean | `false` | Enables one-time-read secrets. Secrets tagged `burn` are deleted after first successful GET. |
| `require_envelope_encryption` | boolean | `false` | Blocks reads of legacy (non-envelope) secrets. Forces migration via `hfs re-encrypt`. |
| `max_secret_size_kb` | number | `0` (unlimited) | Maximum value size in KB. Rejects `PUT /secrets/{key}` if value exceeds limit. |
| `secret_name_pattern` | string | `""` (any) | Regex that new secret keys must match (e.g., `^[A-Z][A-Z0-9_]+$`). Invalid regex is ignored. |
| `max_tags_per_secret` | number | `0` (unlimited) | Maximum number of comma-separated tags per secret. |
| `webhook_url` | string | `""` (disabled) | POST audit events as JSON to this URL after every operation. Uses `waitUntil` - zero latency impact. |
| `webhook_filter` | string | `""` (all events) | Comma-separated actions to send (e.g., `set,delete,auth_failed`). Empty sends everything. |
| `allowed_countries` | string | `""` (all countries) | Comma-separated country codes (e.g., `US,DE,GB`). Blocks requests from non-matching countries via `request.cf.country`. |
| `auto_provision_role` | string | `""` (disabled) | Auto-create users on first login with this role. Trusts Cloudflare Access to control who can reach the vault. |
| `require_warp` | boolean | `false` | Requires requests to come through Cloudflare WARP. Rejects non-WARP requests with 403. See [WARP docs](cloudflare-warp.md). |

## Behavior notes

- **Defaults apply when a flag is not set in KV.** Deleting a flag (`hfs flag rm`) reverts to the default.
- **Auto-type detection**: `"true"`/`"false"` become boolean, numeric strings become number, valid JSON objects become json, everything else is string.
- **All flags are loaded in a single KV batch** per request (via `loadAllFlags`), so there is no per-flag latency penalty.
- **`maintenance`** is checked before authentication - even admins are blocked. Disable via KV directly or Cloudflare dashboard if you lock yourself out.
- **`read_only`** is checked after authentication - unauthenticated requests still get 401, not 503.
- **`public_pages_enabled`** is read per-request via `getFlagValue` (not the batch cache) because public routes run before auth middleware.

- **`burn_after_reading`** - tag a secret with `burn` and it self-destructs after one read. The delete is synchronous (guaranteed before response returns). The flag is a global toggle; only secrets tagged `burn` are affected.
- **`enforce_expiry`** - checks `expires_at` on every GET. Expired secrets return 403 with the expiry timestamp. Set or update the secret to clear.
- **`secret_name_pattern`** - if the regex is invalid, enforcement is silently skipped (won't break writes). Test your pattern before deploying.
- **`webhook_url`** - fires via `waitUntil` after every request, so it adds zero latency. The payload is the full audit entry JSON. If the webhook endpoint is down, the request still succeeds.
- **`allowed_countries`** - uses `request.cf.country` (Cloudflare-provided, ISO 3166-1 alpha-2). Checked before authentication - blocked users don't even get a 401. This feature is unique to Cloudflare Workers.
- **`auto_provision_role`** - when set, any user who passes Cloudflare Access but isn't in the users table is auto-created with this role. The role must exist. Combined with an Access policy (e.g., allow `@company.com`), this enables zero-touch onboarding.

## Examples

```bash
# Lock down for migration
hfs flag set maintenance true

# Require metadata on all new secrets
hfs flag set require_description true
hfs flag set require_tags true

# Cap vault at 1000 secrets, 10 versions each
hfs flag set max_secrets 1000
hfs flag set max_versions 10

# Reduce audit retention to 30 days
hfs flag set audit_retention_days 30

# Hide public pages
hfs flag set public_pages_enabled false

# Revert to default
hfs flag rm max_secrets

# One-time secrets (burn after reading)
hfs flag set burn_after_reading true
hfs set onboard-token "abc123" -t burn -d "One-time onboarding token"
# First read returns value and deletes; second read returns 404

# Block expired secrets
hfs flag set enforce_expiry true

# Force key naming convention
hfs flag set secret_name_pattern '^[A-Z][A-Z0-9_]+$'

# Force migration off legacy encryption
hfs flag set require_envelope_encryption true
# Then: hfs re-encrypt

# Webhooks - send audit events to Slack/SIEM
hfs flag set webhook_url "https://hooks.slack.com/services/T.../B.../xxx"
hfs flag set webhook_filter "set,delete,auth_failed"

# Geo-fencing - restrict access by country (Cloudflare-only)
hfs flag set allowed_countries "US,DE,GB"

# Auto-provision - anyone passing Access gets operator role
hfs flag set auto_provision_role "operator"
```
