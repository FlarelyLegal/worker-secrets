-- Migration: 0006_envelope_encryption.sql
-- Add envelope encryption columns (per-secret DEK encrypted with master KEK).

ALTER TABLE secrets ADD COLUMN encrypted_dek TEXT;
ALTER TABLE secrets ADD COLUMN dek_iv TEXT;
ALTER TABLE secret_versions ADD COLUMN encrypted_dek TEXT;
ALTER TABLE secret_versions ADD COLUMN dek_iv TEXT;
