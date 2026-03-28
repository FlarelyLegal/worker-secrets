-- Migration: 0003_production_hardening.sql
-- For deployments upgrading from v0.7.x or v0.8.x.
-- Fresh deployments already have these columns via the consolidated 0001_init.sql.
-- ALTER TABLE with IF NOT EXISTS is not supported in SQLite, so these use
-- a pattern that silently fails if the column already exists.

-- Service tokens: role FK, provenance, timestamps
ALTER TABLE service_tokens ADD COLUMN role TEXT REFERENCES roles(name);
ALTER TABLE service_tokens ADD COLUMN created_by TEXT DEFAULT '';
ALTER TABLE service_tokens ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- Audit log: request ID correlation
ALTER TABLE audit_log ADD COLUMN request_id TEXT;

-- Secrets: tags for organization
ALTER TABLE secrets ADD COLUMN tags TEXT DEFAULT '';
