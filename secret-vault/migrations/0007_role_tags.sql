-- Migration: 0007_role_tags.sql
-- Add tag-based access restriction to roles.

ALTER TABLE roles ADD COLUMN allowed_tags TEXT DEFAULT '';
