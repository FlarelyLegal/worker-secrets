---
name: add-migration
description: Create a new D1 database migration for the secret-vault. Use when adding tables, columns, or indexes to the vault's schema.
---

# Add a D1 migration

Migrations live in `secret-vault/migrations/`. Applied with Wrangler.

## CONVENTIONS

- **ALWAYS** use sequential naming: `NNNN_description.sql` (next: `0014_*.sql`)
- **ALWAYS** use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE`
- **ALWAYS** add indexes for columns used in WHERE/ORDER BY
- **ALWAYS** test locally first: `npm run db:migrate:local`
- **ALWAYS** use parameterized `.bind()` in Worker code for new columns
- **NEVER** drop tables or columns without a migration plan
- Timestamps: `datetime('now')` (UTC text). No native DATE type.
- Upserts: `ON CONFLICT ... DO UPDATE`

## EXISTING SCHEMA

- `0001_init.sql` - Consolidated: `secrets` (HMAC, tags, envelope encryption, expiry), `secret_versions`, `roles` (seeded, allowed_tags), `users` (RBAC, age_public_key), `service_tokens` (role FK), `audit_log` (request_id, prev_hash, warp_connected)
- `0002_rbac.sql` - Incremental: `roles` + `users` tables (for upgrades from v0.7.x/v0.8.x)
- `0003_production_hardening.sql` - Incremental: role FK, tags, request_id columns (for upgrades)
- `0004_secret_expiry.sql` - Incremental: `expires_at` column on `secrets`
- `0005_audit_hash_chain.sql` - Incremental: `prev_hash` column on `audit_log`
- `0006_envelope_encryption.sql` - Incremental: `encrypted_dek`, `dek_iv` on `secrets` and `secret_versions`
- `0007_role_tags.sql` - Incremental: `allowed_tags` column on `roles`
- `0008_user_pubkey.sql` - Incremental: `age_public_key` column on `users`
- `0009_role_policies.sql` - New table: `role_policies` (policy-based RBAC with per-scope tag restrictions)
- `0010_audit_warp.sql` - Incremental: `warp_connected` column on `audit_log`
- `0011_zt_device_binding.sql` - Incremental: `zt_fingerprint` column on `users`
- `0012_service_token_secret.sql` - Incremental: `client_secret_hash` column on `service_tokens` for direct auth
- `0013_service_token_age_key.sql` - Incremental: `age_public_key` column on `service_tokens` for E2E encryption

See [current schema](references/current-schema.md) for full DDL.

## COMMANDS

```bash
npm run db:migrate:local    # Test locally
npm run db:migrate          # Apply to production
```

## CHECKLIST

- [ ] Create `secret-vault/migrations/NNNN_description.sql`
- [ ] Use `IF NOT EXISTS` / `ALTER TABLE`
- [ ] Add indexes for queried columns
- [ ] Test with `npm run db:migrate:local`
- [ ] Update Worker source to use new columns/tables
- [ ] Update [current-schema.md](references/current-schema.md)
