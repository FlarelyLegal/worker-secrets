# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Miscellaneous

- Filter merge commits from changelog

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

