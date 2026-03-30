# Security

## Reporting vulnerabilities

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](https://github.com/FlarelyLegal/worker-secrets/security/advisories/new). Do not open a public issue.

We aim to acknowledge reports within 48 hours and provide a fix or mitigation plan within 7 days.

## Threat model

### What we protect against

| Threat | Mitigation |
|--------|-----------|
| **Data at rest compromise** | Envelope encryption: per-secret DEK (AES-256-GCM) wrapped by master KEK. Compromising one DEK exposes one secret, not the vault. AAD binding ties each ciphertext to its secret key name - decryption fails if the key is moved or swapped. HMAC-SHA256 integrity binding with an independent key detects tampering even if the encryption key is compromised. |
| **Stolen session or token** | Cloudflare Access validates at the edge, Worker re-validates the JWT. Service tokens must be registered with name, role, and scopes. Tag-based RBAC restricts access to matching secrets. Direct service token auth (`--secret` flag) stores a SHA-256 hash and authenticates with timing-safe comparison - stolen credentials cannot be replayed without the original secret. |
| **Privilege escalation** | RBAC with last-admin protection. Users can be disabled without deletion. ALLOWED_EMAILS fallback grants reader (not admin). Self-deletion blocked. |
| **Audit tampering** | SHA-256 hash-chained audit log. Each entry links to the previous. Modifying or deleting entries breaks the chain. Verifiable with `hfs audit-verify`. |
| **Insider bulk exfiltration** | `disable_export` feature flag blocks bulk export. Tag-based RBAC limits scope. All access logged with identity and request ID. |
| **Compromised server** | E2E secrets encrypted client-side with [age](https://age-encryption.org/) before reaching the Worker. A compromised Worker or database sees only age ciphertext. Use `--private` for personal secrets or `--e2e` for team-shared secrets. |

### What we explicitly do not protect against

| Threat | Why |
|--------|-----|
| **Compromised Cloudflare account** | Dashboard access can read Wrangler secrets (the master key). Same trust boundary as any cloud-hosted vault. E2E secrets remain protected - age decryption requires the client's private key. |
| **Malicious Worker deployment** | A modified Worker can read the master key at runtime. Mitigate with CI/CD controls, branch protection, and Access policies. E2E secrets remain protected. |
| **DDoS** | No application-level rate limiting. Relies on Cloudflare's edge DDoS protection. |
| **WARP enforcement for service tokens** | Machine-to-machine traffic from registered service tokens bypasses `require_warp` enforcement by design. Service tokens represent automated systems that cannot enroll in WARP. |
| **Side-channel timing attacks** | AES-GCM via `crypto.subtle` is constant-time in the Workers runtime. Service token hash comparison uses `timingSafeEqual` to prevent timing oracle attacks on credential verification. |

### Trust boundaries

```
Internet → Cloudflare Edge (DDoS, TLS, Access) → Worker (JWT validation, RBAC, encryption) → D1 (ciphertext only)
```

The master key (`ENCRYPTION_KEY`) and optional `INTEGRITY_KEY` are the root of trust. They are stored as Wrangler secrets, encrypted at rest by Cloudflare, and available only at Worker runtime.

## Hardening guide

### Required

- [ ] Set `ENCRYPTION_KEY` via `wrangler secret put` (never in code or wrangler.jsonc)
- [ ] Configure Cloudflare Access with your IdP and appropriate policies
- [ ] Register all service tokens with minimal scopes (`read` for CI, `read,write` for deploy); use `--secret` for direct auth if the token must reach endpoints without Access protection
- [ ] Add users to the `users` table with appropriate roles (don't rely on `ALLOWED_EMAILS`)

### Recommended

- [ ] Run `hfs scan` on your repositories to detect hardcoded secrets before they reach the vault (detects Cloudflare tokens, API keys, and common credential patterns)
- [ ] Set a separate `INTEGRITY_KEY` via `wrangler secret put` for HMAC key separation
- [ ] Run `hfs re-encrypt` to migrate all secrets to envelope encryption
- [ ] Enable `require_description` and `require_tags` flags for organizational discipline
- [ ] Set `max_secrets` to prevent unbounded growth
- [ ] Set `disable_export` in production to prevent bulk exfiltration
- [ ] Enable `require_warp` flag to enforce Cloudflare WARP enrollment ([docs](docs/cloudflare-warp.md))
- [ ] Configure Access policy to require hardware keys (`hwk`) for interactive sessions
- [ ] Use tag-based RBAC: create roles with `allowed_tags` to limit access by team/environment
- [ ] Register age public keys on service tokens with `--age-key` to enable E2E encryption by automated systems
- [ ] Use `hfs set --private` for personal secrets (only your key can decrypt)
- [ ] Use `hfs set --e2e` for team secrets (RBAC-based recipients, revocable via `rewrap`)
- [ ] Run `hfs keygen --register` and back up your identity file securely (losing it = losing access to e2e secrets)
- [ ] After revoking a user, run `hfs rewrap --all` to re-encrypt without their key
- [ ] Periodically run `hfs audit-verify` to check hash chain integrity
- [ ] Set `audit_retention_days` appropriate to your compliance requirements

### Key rotation

See [Encryption Architecture - Key Rotation](docs/encryption.md#key-rotation) for step-by-step instructions and diagrams covering master key, integrity key, and age identity rotation.

## Dependencies

The Worker uses only three runtime dependencies:
- `hono` + `@hono/zod-openapi` - HTTP framework and schema validation
- `jose` - JWT verification (JWKS)

All cryptographic operations use the Web Crypto API (`crypto.subtle`), built into the Cloudflare Workers runtime. No third-party crypto libraries.
