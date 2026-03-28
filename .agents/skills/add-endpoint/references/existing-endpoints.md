# Existing API endpoints

Source: `secret-vault/src/routes/secrets.ts`, `secret-vault/src/routes/tokens.ts`, `secret-vault/src/index.ts`

## Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status: "ok" }` |
| `GET` | `/doc` | Scalar API reference UI |
| `GET` | `/doc/json` | OpenAPI 3.0 spec (JSON) |

## Authenticated (all require valid JWT via Cf-Access-Jwt-Assertion)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/whoami` | any | Returns auth method, identity, name, scopes |
| `GET` | `/secrets` | read | List all keys (no values) |
| `GET` | `/secrets/export` | interactive + read | Export all secrets decrypted in one response |
| `GET` | `/secrets/:key` | read | Get decrypted secret |
| `PUT` | `/secrets/:key` | write | Create or update secret (`"export"` is a reserved key name) |
| `DELETE` | `/secrets/:key` | delete | Delete a secret |
| `GET` | `/audit` | interactive only | View audit log (accepts `?limit=N`) |
| `GET` | `/tokens` | interactive only | List registered service tokens |
| `PUT` | `/tokens/:clientId` | interactive only | Register a service token |
| `DELETE` | `/tokens/:clientId` | interactive only | Revoke a service token |

## Request/response patterns

### PUT body (secrets)
```json
{ "value": "secret-text", "description": "optional" }
```

### PUT body (tokens)
```json
{ "name": "token-name", "description": "optional", "scopes": "read,write" }
```

### Error responses
```json
{ "error": "message" }
```
Status codes: 400 (bad input), 401 (no auth), 403 (wrong scope/role), 404 (not found).
