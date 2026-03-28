# Current D1 schema

Applied via `secret-vault/migrations/`.

## Tables

### secrets

```sql
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,        -- AES-256-GCM encrypted, base64 encoded
  iv TEXT NOT NULL,           -- initialization vector, base64 encoded
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_secrets_updated_at ON secrets(updated_at);
```

### service_tokens

```sql
CREATE TABLE IF NOT EXISTS service_tokens (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  scopes TEXT DEFAULT '*',    -- comma-separated: '*', 'read', 'write', 'delete'
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);
```

### audit_log

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  method TEXT NOT NULL,       -- 'interactive' or service token name
  identity TEXT NOT NULL,     -- email or client_id
  action TEXT NOT NULL,       -- 'get', 'set', 'delete', 'list', 'export', etc.
  secret_key TEXT,            -- which secret (null for list operations)
  ip TEXT
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_identity ON audit_log(identity);
```

## Conventions

- All timestamps are SQLite `datetime('now')` (UTC, text format)
- Primary keys are text, not auto-increment (except audit_log)
- Use `ON CONFLICT ... DO UPDATE` for upserts
- Always use parameterized `.bind()`, never string interpolation
