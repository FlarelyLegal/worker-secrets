-- Store hashed client secret so the Worker can validate service tokens
-- independently of Cloudflare Access path protection.
ALTER TABLE service_tokens ADD COLUMN client_secret_hash TEXT;
