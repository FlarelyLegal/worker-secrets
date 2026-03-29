# Feature Flags

Runtime configuration stored in Cloudflare KV. All flags are plaintext (not encrypted). Changes take effect on the next request — no redeploy needed.

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
| `maintenance` | boolean | `false` | Returns 503 for all authenticated requests. Checked before auth — blocks everyone. |
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

## Behavior notes

- **Defaults apply when a flag is not set in KV.** Deleting a flag (`hfs flag rm`) reverts to the default.
- **Auto-type detection**: `"true"`/`"false"` become boolean, numeric strings become number, valid JSON objects become json, everything else is string.
- **All flags are loaded in a single KV batch** per request (via `loadAllFlags`), so there is no per-flag latency penalty.
- **`maintenance`** is checked before authentication — even admins are blocked. Disable via KV directly or Cloudflare dashboard if you lock yourself out.
- **`read_only`** is checked after authentication — unauthenticated requests still get 401, not 503.
- **`public_pages_enabled`** is read per-request via `getFlagValue` (not the batch cache) because public routes run before auth middleware.

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
```
