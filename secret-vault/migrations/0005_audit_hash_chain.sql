-- Migration: 0005_audit_hash_chain.sql
-- Add hash chain column for tamper-evident audit trail.

ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;
