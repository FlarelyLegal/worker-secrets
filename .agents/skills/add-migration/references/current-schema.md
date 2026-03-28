# Current D1 schema

Applied via `secret-vault/migrations/`.

## Tables

### secrets

```sql
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,            -- AES-256-GCM encrypted, base64 encoded
  iv TEXT NOT NULL,               -- initialization vector, base64 encoded
  hmac TEXT NOT NULL DEFAULT '',  -- HMAC-SHA256 integrity binding
  description TEXT DEFAULT '',
  created_by TEXT DEFAULT '',     -- identity of creator
  updated_by TEXT DEFAULT '',     -- identity of last updater
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_secrets_updated_at ON secrets(updated_at);
```

### service_tokens

```sql
CREATE TABLE IF NOT EXISTS service_tokens (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,             -- e.g. "code-review-worker", "ci-pipeline"
  description TEXT DEFAULT '',
  scopes TEXT DEFAULT '*',        -- comma-separated: '*' = all, 'read', 'write', 'delete'
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);
```

### audit_log

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  method TEXT NOT NULL,           -- 'interactive' or service token name
  identity TEXT NOT NULL,         -- email or client_id
  action TEXT NOT NULL,           -- 'get', 'set', 'delete', 'list', 'export', 'import'
  secret_key TEXT,                -- which secret was accessed (null for list/export/import)
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_identity ON audit_log(identity);
CREATE INDEX idx_audit_log_secret_key ON audit_log(secret_key, timestamp);
CREATE INDEX idx_audit_log_action ON audit_log(action, timestamp);
```

### secret_versions

```sql
CREATE TABLE IF NOT EXISTS secret_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  secret_key TEXT NOT NULL,
  value TEXT NOT NULL,            -- AES-256-GCM encrypted, base64 encoded (previous value)
  iv TEXT NOT NULL,               -- initialization vector, base64 encoded
  hmac TEXT NOT NULL DEFAULT '',  -- HMAC-SHA256 integrity binding
  description TEXT DEFAULT '',
  changed_by TEXT DEFAULT '',     -- identity of who made the change
  changed_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (secret_key) REFERENCES secrets(key) ON DELETE CASCADE
);

CREATE INDEX idx_secret_versions_key ON secret_versions(secret_key, changed_at);
```

## Conventions

- All timestamps are SQLite `datetime('now')` (UTC, text format)
- Primary keys are text, not auto-increment (except audit_log)
- Use `ON CONFLICT ... DO UPDATE` for upserts
- Always use parameterized `.bind()`, never string interpolation
