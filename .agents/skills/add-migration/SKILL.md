---
name: add-migration
description: Create a new D1 database migration for the secret-vault. Use when adding tables, columns, or indexes to the vault's schema.
---

# Add a D1 migration

Migrations live in `secret-vault/migrations/`. Applied with Wrangler.

## CONVENTIONS

- **ALWAYS** use sequential naming: `NNNN_description.sql` (next: `0002_*.sql`)
- **ALWAYS** use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE`
- **ALWAYS** add indexes for columns used in WHERE/ORDER BY
- **ALWAYS** test locally first: `npm run db:migrate:local`
- **ALWAYS** use parameterized `.bind()` in Worker code for new columns
- **NEVER** drop tables or columns without a migration plan
- Timestamps: `datetime('now')` (UTC text). No native DATE type.
- Upserts: `ON CONFLICT ... DO UPDATE`

## EXISTING SCHEMA

- `0001_init.sql` — `secrets` (with HMAC integrity), `service_tokens`, `audit_log`, `secret_versions`

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
