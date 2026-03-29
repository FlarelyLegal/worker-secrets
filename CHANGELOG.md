# Changelog

All notable changes to this project will be documented in this file.

## [0.18.0] - 2026-03-29

### Features

- End-to-end encryption with age — zero-knowledge secrets
- Update landing page with e2e encryption highlight
- Landing page orange accents — headline, section headers, hover states, footer
- End-to-end encryption with age (#5)

## [0.17.0] - 2026-03-29

### Bug Fixes

- Audit ORDER BY id for chain alignment, deduplicate JWT parse in login

### Features

- 6 new feature flags — enforce_expiry, burn_after_reading, and more

### Miscellaneous

- Bump version to 0.17.0

## [0.16.1] - 2026-03-29

### Bug Fixes

- CLI hardening — rotate-key stdin, cp --move confirm, import tags, JWT parse

### Miscellaneous

- Bump version to 0.16.1

## [0.16.0] - 2026-03-29

### Bug Fixes

- Enforce tag-based RBAC on all paths, tighten privilege boundaries
- Close empty-tags bypass for tag-restricted roles, flag-gate /doc/json
- Update OpenAPI tokens tag to admin-only, clearer import error messages
- Tag-based RBAC enforcement + privilege hardening (#4)

### Miscellaneous

- Expand .gitignore for env files, IDE state, build artifacts
- Bump version to 0.16.0

## [0.15.0] - 2026-03-29

### Bug Fixes

- Security hardening — tag bypass in export, audit admin-only, parameterized SQL, headers

### Miscellaneous

- Bump version to 0.15.0

## [0.14.0] - 2026-03-29

### Bug Fixes

- Parse redirect URL properly to satisfy CodeQL URL sanitization
- Add explicit permissions to CI workflow (CodeQL actions/missing-workflow-permissions)
- Version archive and restore now preserve DEK columns
- HMAC now binds encrypted_dek and dek_iv to prevent DEK swap attacks
- Rotate-key now includes secret_versions DEKs
- Split admin-ops, update completions, validate expires_at, import expires_at

### Miscellaneous

- Bump version to 0.14.0

### Testing

- Security path tests (42 total, was 36)

## [0.13.0] - 2026-03-29

### Features

- Re-encrypt, rotate-key, audit-verify commands + secrets.ts split
- V0.13.0 — SECURITY.md, architecture diagram, key rotation workflow

## [0.12.0] - 2026-03-29

### Features

- Secret expiry/rotation tracking
- Tamper-evident audit log with SHA-256 hash chaining
- Envelope encryption with per-secret DEKs and optional INTEGRITY_KEY
- Tag-based access control — roles can restrict access by secret tags
- V0.12.0 — envelope encryption, tag-based RBAC, hash-chained audit, 36 tests

### Performance

- Batch flag reads — single KV load per request instead of 2-5

### Refactor

- Replace magic strings with typed constants

### Testing

- Comprehensive test suite + CLI updates for tag-based RBAC

## [0.11.0] - 2026-03-29

### Features

- Add 7 new runtime feature flags

### Miscellaneous

- Bump version to 0.11.0

## [0.10.0] - 2026-03-28

### Bug Fixes

- Last-admin protection and ALLOWED_EMAILS fallback demotion
- Add incremental migrations for deployments upgrading from v0.7.x/v0.8.x

### Features

- Wire tags end-to-end through API, export/import, and CLI
- Add --role flag to token register CLI and show role in token ls
- Version restore endpoint and CLI commands
- Audit log filtering by identity, action, key, method, and date range
- Add --json flag to get, whoami, and flag get commands
- V0.10.0 — health check KV, per-service status in CLI and health page

## [0.9.0] - 2026-03-28

### Bug Fixes

- Update tests for RBAC schema (roles/users tables, new columns)

### Features

- V0.9.0 — RBAC, user/role management, schema split, production hardening

## [0.8.0] - 2026-03-28

### Features

- Wire 6 runtime feature flags, extract versions route, bump v0.8.0

## [0.7.0] - 2026-03-28

### Features

- Switch to base64url encoding for ciphertext, IV, and HMAC storage
- V0.7.0 — feature flags, base64url, secret versioning, search, copy

## [0.6.0] - 2026-03-28

### Features

- V0.6.0 — HMAC integrity, secret versioning, search, copy, deploy destroy

### Miscellaneous

- Filter merge commits from changelog
- Skip docs commits from changelog

## [0.5.0] - 2026-03-28

### Features

- V0.5.0 — tests, deploy destroy, CORS, version check

## [0.4.0] - 2026-03-28

### Features

- Worker hardening — atomic imports, auth logging, provenance, request IDs

### Miscellaneous

- Bump actions/checkout from 4.2.2 to 6.0.2
- Bump actions/checkout from 4.2.2 to 6.0.2 (#1)
- Bump softprops/action-gh-release from 2.3.2 to 2.6.1
- Bump softprops/action-gh-release from 2.3.2 to 2.6.1 (#2)
- Bump actions/setup-node from 4.4.0 to 6.3.0 (#3)

## [0.3.1] - 2026-03-28

### Bug Fixes

- V0.3.1 — CLI robustness, pagination, timeouts, and UX polish

### Miscellaneous

- Add Dependabot for npm and GitHub Actions updates
- Bump actions/setup-node from 4.4.0 to 6.3.0

## [0.3.0] - 2026-03-28

### Features

- V0.3.0 — security hardening, pagination, CI, and open-source readiness

## [0.2.0] - 2026-03-28

### Bug Fixes

- Use git-cliff action in release workflow
- Disable workers.dev and preview URLs by default, add .npmrc for GitHub Packages
- Point cloudflared login at /secrets (protected by Access)
- Send JWT as both cookie and header for Access-independent auth
- Match right column to Kumo card style, remove emojis
- Footer attribution to The HomeFlare Project
- Footer spans full width across both columns
- Remove duplicate title, keep brand mark only
- Landing description focuses on use case, not security (covered by right column)
- Description clarifies self-hosted vault with Access IdP support
- Swap columns, security left, links right
- Show npm install command for CLI link
- Brand and description span full width above both columns

### Features

- Encrypted secret vault for Cloudflare Workers with CLI
- Styled health page for browsers with content negotiation
- Multi-domain support in deploy prompts and flags
- Two-column landing page with security architecture, extract HTML to pages.ts
- Add GitHub and Install CLI links to landing page
- YAML issue templates for bugs, features, deploy issues, and security

### Miscellaneous

- Update actions to latest versions, use Node 24
- Regenerate changelog with all v0.2.0 commits

