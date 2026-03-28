-- Migration: 0002_rbac.sql
-- For deployments upgrading from v0.7.x or v0.8.x.
-- Fresh deployments already have these tables via the consolidated 0001_init.sql.

CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY,
  scopes TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (role) REFERENCES roles(name)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

INSERT OR IGNORE INTO roles (name, scopes, description, created_by) VALUES
  ('admin',    '*',           'Full access including user and role management', 'system'),
  ('operator', 'read,write',  'Read and write secrets, no delete or admin',    'system'),
  ('reader',   'read',        'Read-only access to secrets',                   'system');
