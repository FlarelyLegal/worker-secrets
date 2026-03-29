# Existing API endpoints

Source: `secret-vault/src/routes/`

## Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status, database }` (503 if DB unreachable) |
| `GET` | `/doc` | Scalar API reference UI |
| `GET` | `/doc/json` | OpenAPI 3.0 spec (JSON, dynamic server URL) |
| `GET` | `/` | Landing page (HTML) |

## Authenticated (require valid JWT via Cf-Access-Jwt-Assertion)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/whoami` | any | Auth method, identity, name, scopes |
| `GET` | `/secrets?limit=&offset=&search=` | read | Paginated list (returns `{ secrets, total }`); `search` filters keys by pattern |
| `GET` | `/secrets/export` | interactive + read | Bulk export all secrets decrypted |
| `POST` | `/secrets/import` | interactive + write | Bulk import from JSON (atomic via db.batch) |
| `GET` | `/secrets/{key}` | read | Get decrypted secret (includes `created_by`, `updated_by`) |
| `GET` | `/secrets/{key}/versions` | read | List previous versions of a secret (returns version metadata) |
| `POST` | `/secrets/{key}/versions/{id}/restore` | write | Restore a secret to a previous version (archives current first) |
| `PUT` | `/secrets/{key}` | write | Create or update (`"export"` and `"import"` are reserved keys); computes HMAC-SHA256 integrity tag |
| `DELETE` | `/secrets/{key}` | delete | Delete a secret |
| `GET` | `/audit?limit=&offset=&identity=&action=&key=&method=&from=&to=` | admin | Paginated audit log with filters |
| `GET` | `/tokens` | admin | List registered service tokens |
| `PUT` | `/tokens/{clientId}` | admin | Register a service token |
| `DELETE` | `/tokens/{clientId}` | admin | Revoke a service token |
| `GET` | `/flags` | read | List all feature flags (KV-backed, plaintext) |
| `GET` | `/flags/{key}` | read | Get a flag value with metadata |
| `PUT` | `/flags/{key}` | admin | Set a flag (auto-detects type: boolean, number, json, string) |
| `DELETE` | `/flags/{key}` | admin | Delete a flag |
| `GET` | `/users` | admin | List all users with role, enabled status, last login |
| `PUT` | `/users/{email}` | admin | Add or update a user with role assignment |
| `PATCH` | `/users/{email}` | admin | Partial update (name, role, enabled) |
| `DELETE` | `/users/{email}` | admin | Remove a user (cannot delete self) |
| `GET` | `/roles` | admin | List all roles with scopes |
| `PUT` | `/roles/{name}` | admin | Create or update a role |
| `PATCH` | `/roles/{name}` | admin | Partial update (scopes, description) |
| `DELETE` | `/roles/{name}` | admin | Delete a role (rejects if users/tokens assigned) |
| `POST` | `/admin/re-encrypt` | admin | Migrate legacy secrets to envelope encryption |
| `POST` | `/admin/rotate-key` | admin | Re-wrap all DEKs with a new master key |

## Request/response patterns

### PUT body (secrets)
```json
{ "value": "secret-text", "description": "optional" }
```
Limits: value max 1MB, key max 256 chars, description max 1000 chars.

### POST body (import)
```json
{ "secrets": [{ "key": "k", "value": "v", "description": "d" }], "overwrite": false }
```

### PUT body (tokens)
```json
{ "name": "token-name", "description": "optional", "scopes": "read,write", "role": "operator" }
```
Valid scopes: `*`, `read`, `write`, `delete` (comma-separated). Name max 256, description max 1000. Optional `role` overrides scopes when set.

### PUT body (users)
```json
{ "email": "user@example.com", "name": "Display Name", "role": "operator" }
```

### PUT body (roles)
```json
{ "name": "role-name", "scopes": "read,write", "description": "optional", "allowed_tags": "production,staging" }
```
Role names: lowercase alphanumeric, hyphens, underscores. Scopes max 64 chars. `allowed_tags` optional, max 500 chars.

### List response (paginated)
```json
{ "secrets": [...], "total": 42 }
```

### Error responses
```json
{ "error": "message" }
```
Status codes: 400 (bad input/validation), 401 (no auth), 403 (wrong scope/role), 404 (not found), 500 (internal), 503 (degraded).

### Security headers (all responses)
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: interest-cohort=()`
- `Cross-Origin-Resource-Policy: same-site`
- `X-Request-ID: <uuid>` (for debugging)
- `Content-Security-Policy` (HTML only)
- `X-Frame-Options: DENY` (HTML only)
