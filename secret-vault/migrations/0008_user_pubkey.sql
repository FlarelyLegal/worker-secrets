-- Add age public key to users for e2e team sharing
ALTER TABLE users ADD COLUMN age_public_key TEXT;
