# Changelog

All notable changes to this project will be documented in this file.

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

