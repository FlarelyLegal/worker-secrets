-- Service tokens get their own age public key for E2E encryption.
-- Allows automated systems to participate in zero-knowledge encryption.
ALTER TABLE service_tokens ADD COLUMN age_public_key TEXT;
