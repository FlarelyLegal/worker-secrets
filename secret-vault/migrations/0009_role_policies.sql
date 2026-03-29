-- Policy-based RBAC: multiple permission rules per role
-- Each policy binds a set of scopes to specific tags
CREATE TABLE IF NOT EXISTS role_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  scopes TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (role) REFERENCES roles(name) ON DELETE CASCADE
);
