---
name: add-test
description: Write tests for the secret-vault Worker and hfs CLI. Use when adding test coverage, fixing bugs with regression tests, or validating behavior.
---

# Add tests

28 tests exist across Worker (23) and CLI (5). Tests run in CI (`ci.yml`) and release (`release.yml`) workflows. This covers patterns and guidance for adding more.

## CONVENTIONS

- **ALWAYS** test crypto round-trip (encrypt → decrypt = original)
- **ALWAYS** test auth rejection (missing JWT, unregistered token, wrong scope)
- **ALWAYS** test error cases (malformed JSON → 400, not 500)
- **NEVER** use real encryption keys or credentials in tests
- **NEVER** skip scope enforcement tests when adding new endpoints

## WORKER TESTS (vitest + miniflare)

### Setup

```bash
cd secret-vault
npm install -D vitest @cloudflare/vitest-pool-workers
```

```typescript
// secret-vault/vitest.config.ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          d1Databases: ["DB"],
          bindings: {
            ENCRYPTION_KEY: "a".repeat(64),
            ALLOWED_EMAILS: "test@example.com",
            TEAM_DOMAIN: "https://test.cloudflareaccess.com",
            POLICY_AUD: "test-aud",
          },
        },
      },
    },
  },
});
```

### Critical paths (test first)

1. Encrypt → decrypt round-trip
2. Hex key validation (non-hex ENCRYPTION_KEY → error)
3. Auth rejects missing JWT (401)
4. Auth rejects unregistered service token (401)
5. Failed auth audit logging (method: "rejected", action: "auth_failed")
6. Scope enforcement: read-only token can't write/delete (403)
7. CRUD: create, read, update, delete a secret
8. Body size limits (value >1MB → 400, key >256 chars → 400)
9. Audit log records every operation
10. Reserved keys `"export"` and `"import"` rejected on PUT (400)
11. Reserved key names rejected in bulk import

## CLI TESTS (vitest)

```bash
cd hfs && npm install -D vitest
```

### Critical paths

1. `resolveAuth()` returns correct mode for each env var combination
2. `resolveAuth()` throws on partial service token env vars
3. `resolveAuth()` throws on expired JWT
4. `storeJwt()` rejects malformed JWT
5. VaultClient builds correct headers for each auth mode

## REFERENCES

- [Test patterns](references/test-patterns.md) — code examples for Worker, crypto, CLI, and scope tests
