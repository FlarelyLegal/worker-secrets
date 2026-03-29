-- Migration: 0004_secret_expiry.sql
-- Add optional expiry date for secret rotation tracking.

ALTER TABLE secrets ADD COLUMN expires_at TEXT;
