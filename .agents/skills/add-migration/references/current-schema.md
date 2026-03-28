# Current D1 schema

Applied via `secret-vault/migrations/0001_init.sql` (single consolidated migration).

## Tables

### secrets

```sql
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,            -- AES-256-GCM encrypted, base64url encoded
  iv TEXT NOT NULL,               -- initialization vector, base64url encoded
  hmac TEXT NOT NULL DEFAULT '',  -- HMAC-SHA256 integrity binding (key + ciphertext + iv)
  description TEXT DEFAULT '',
  tags TEXT DEFAULT '',            -- comma-separated tags for organization
  created_by TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_secrets_updated_at ON secrets(updated_at);
```

### secret_versions

```sql
CREATE TABLE IF NOT EXISTS secret_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  secret_key TEXT NOT NULL,
  value TEXT NOT NULL,            -- AES-256-GCM encrypted, base64url encoded (previous value)
  iv TEXT NOT NULL,
  hmac TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  changed_by TEXT DEFAULT '',
  changed_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (secret_key) REFERENCES secrets(key) ON DELETE CASCADE
);

CREATE INDEX idx_secret_versions_key ON secret_versions(secret_key, changed_at);
```

### roles

```sql
CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY,             -- e.g. 'admin', 'operator', 'reader'
  scopes TEXT NOT NULL,              -- comma-separated: 'read', 'write', 'delete', '*'
  description TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Seeded with: `admin` (`*`), `operator` (`read,write`), `reader` (`read`).

### users

```sql
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,                -- references roles.name
  enabled INTEGER NOT NULL DEFAULT 1, -- 0 = disabled (auth rejected without deletion)
  last_login_at TEXT,
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (role) REFERENCES roles(name)
);

CREATE INDEX idx_users_role ON users(role);
```

### service_tokens

```sql
CREATE TABLE IF NOT EXISTS service_tokens (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,             -- e.g. "code-review-worker", "ci-pipeline"
  description TEXT DEFAULT '',
  scopes TEXT DEFAULT '*',        -- comma-separated: 'read', 'write', 'delete', '*'
  role TEXT REFERENCES roles(name), -- optional: overrides scopes when set
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);
```

### audit_log

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  method TEXT NOT NULL,           -- 'interactive', 'rejected', or service token name
  identity TEXT NOT NULL,         -- email or client_id
  action TEXT NOT NULL,           -- 'get', 'set', 'delete', 'list', 'export', 'import', 'auth_failed'
  secret_key TEXT,                -- which secret was accessed (null for list/export/import)
  ip TEXT,
  user_agent TEXT,
  request_id TEXT                 -- correlates with X-Request-ID response header
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_identity ON audit_log(identity);
CREATE INDEX idx_audit_log_secret_key ON audit_log(secret_key, timestamp);
CREATE INDEX idx_audit_log_action ON audit_log(action, timestamp);
```

## Conventions

- All timestamps are SQLite `datetime('now')` (UTC, text format)
- Primary keys are text, not auto-increment (except audit_log, secret_versions)
- Use `ON CONFLICT ... DO UPDATE` for upserts
- Always use parameterized `.bind()`, never string interpolation
- Single migration file: all schema changes consolidated into `0001_init.sql`
