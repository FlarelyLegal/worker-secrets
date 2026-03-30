# Security

## Reporting vulnerabilities

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](https://github.com/FlarelyLegal/worker-secrets/security/advisories/new). Do not open a public issue.

We aim to acknowledge reports within 48 hours and provide a fix or mitigation plan within 7 days.

## Threat model

### What we protect against

| Threat | Mitigation |
|--------|-----------|
| **Data at rest compromise** | Envelope encryption: per-secret DEK (AES-256-GCM) wrapped by master KEK. AAD binds the secret key name to ciphertext at the GCM layer. HMAC-SHA256 with independent `INTEGRITY_KEY` binds all encrypted fields. Two integrity layers: AAD catches key-name rebinding, HMAC catches all tampering even if the encryption key is compromised. |
| **Stolen session or token** | Cloudflare Access validates at the edge, Worker re-validates the JWT. Service tokens must be registered with name, role, and scopes. Direct auth (`--secret`) validates SHA-256 hash with timing-safe comparison. Tag-based RBAC restricts access to matching secrets. |
| **Identity spoofing via JWT** | JWT `common_name` fallback only accepted when `payload.type === "app"` (Cloudflare-issued service token JWT). Interactive IdP JWTs cannot inject a `common_name` to impersonate a service token. |
| **Privilege escalation** | RBAC with last-admin protection. Policy management requires interactive admin auth. Users can be disabled without deletion. `ALLOWED_EMAILS` fallback grants reader (not admin). Self-deletion blocked. |
| **Audit tampering** | SHA-256 hash-chained audit log with timestamp in hash input. Each entry links to the previous. Modifying or deleting entries breaks the chain. Verifiable with `hfs audit-verify`. |
| **Insider bulk exfiltration** | `disable_export` feature flag blocks bulk export. Tag-based RBAC limits scope. All access logged with identity and request ID. |
| **Compromised server** | E2E secrets encrypted client-side with [age](https://age-encryption.org/) before reaching the Worker. A compromised Worker or database sees only age ciphertext. Use `--private` for personal secrets or `--e2e` for team-shared secrets. Service tokens can have their own age keys (`--age-key`) for zero-knowledge CI/CD. |
| **SSRF via webhooks** | Webhook URLs must be HTTPS. Private/reserved IPv4 ranges blocked (10.x, 172.16-31.x, 192.168.x, 169.254.x, 100.64-127.x CGNAT, 127.x loopback). IPv6 ULA (fc/fd) and link-local (fe80) blocked. IPv4-mapped IPv6 (`::ffff:`) resolved and checked. Bare hostnames rejected. |
| **Replay attacks (WARP)** | Timestamp-based HMAC challenge-response with 2-minute window in both directions. Future timestamps rejected. Fingerprint bound to ZT CA certificate. |

### What we explicitly do not protect against

| Threat | Why |
|--------|-----|
| **Compromised Cloudflare account** | Dashboard access can read Wrangler secrets (the master key). Same trust boundary as any cloud-hosted vault. E2E secrets remain protected - age decryption requires the client's private key. |
| **Malicious Worker deployment** | A modified Worker can read the master key at runtime. Mitigate with CI/CD controls, branch protection, and Access policies. E2E secrets remain protected. |
| **DDoS** | No application-level rate limiting. Relies on Cloudflare's edge DDoS protection. |
| **ReDoS via admin regex** | `FLAG_SECRET_NAME_PATTERN` accepts admin-set regex patterns (200-char cap). V8's irregular engine mitigates most backtracking, but nested quantifiers could cause CPU timeouts. Only admins can set this flag. |
| **Service token WARP bypass** | Service tokens are exempt from WARP enforcement by design. Machine-to-machine traffic cannot enroll in WARP. The exemption is set server-side based on D1 token lookup and cannot be forged. |
| **Audit chain mutation under concurrency** | The hash chain self-heals under concurrent inserts by updating the predecessor hash. This means committed entries can be mutated (to correct chain order). A compromised database admin could exploit this window. `hfs audit-verify` detects tampered chains but not legitimate self-heals. |

### Trust boundaries

```
Internet -> Cloudflare Edge (DDoS, TLS, Access) -> Worker (JWT, RBAC, encryption) -> D1 (ciphertext only)
```

The master key (`ENCRYPTION_KEY`) and optional `INTEGRITY_KEY` are the root of trust. They are stored as Wrangler secrets, encrypted at rest by Cloudflare, and available only at Worker runtime.

## Hardening guide

### Required

- [ ] Set `ENCRYPTION_KEY` via `wrangler secret put` (never in code or wrangler.jsonc)
- [ ] Configure Cloudflare Access with your IdP and appropriate policies
- [ ] Register all service tokens with minimal scopes (`read` for CI, `read,write` for deploy); use `--secret` for direct auth
- [ ] Add users to the `users` table with appropriate roles (don't rely on `ALLOWED_EMAILS`)

### Recommended

- [ ] Run `hfs scan` on your codebase to find and migrate hardcoded secrets
- [ ] Set a separate `INTEGRITY_KEY` via `wrangler secret put` for HMAC key separation
- [ ] Use `--age-key` when registering service tokens for zero-knowledge CI/CD
- [ ] Run `hfs re-encrypt` to migrate all secrets to envelope encryption
- [ ] Enable `require_description` and `require_tags` flags for organizational discipline
- [ ] Set `max_secrets` to prevent unbounded growth
- [ ] Set `disable_export` in production to prevent bulk exfiltration
- [ ] Enable `require_warp` flag to enforce Cloudflare WARP enrollment ([docs](docs/cloudflare-warp.md))
- [ ] Configure Access policy to require hardware keys (`hwk`) for interactive sessions
- [ ] Use tag-based RBAC: create roles with policy rules to limit access by team/environment
- [ ] Use `hfs set --private` for personal secrets (only your key can decrypt)
- [ ] Use `hfs set --e2e` for team secrets (RBAC-based recipients, revocable via `rewrap`)
- [ ] Run `hfs keygen --register` and back up your identity file securely
- [ ] After revoking a user, run `hfs rewrap --all` to re-encrypt without their key
- [ ] Periodically run `hfs audit-verify` to check hash chain integrity
- [ ] Set `audit_retention_days` appropriate to your compliance requirements
- [ ] Set `FLAG_SECRET_NAME_PATTERN` to enforce key naming conventions (use simple patterns only)
- [ ] Verify config file permissions: `ls -la ~/Library/Preferences/hfs-nodejs/config.json` should be `0600`

### Key rotation

See [Encryption Architecture - Key Rotation](docs/encryption.md#key-rotation) for step-by-step instructions and diagrams covering master key, integrity key, and age identity rotation.

## Cryptographic properties

| Property | Implementation |
|----------|---------------|
| **Encryption** | AES-256-GCM via Web Crypto API (`crypto.subtle`). Per-secret random DEK, wrapped by master KEK. |
| **AAD binding** | Secret key name passed as GCM Additional Authenticated Data. Prevents ciphertext transplant between keys. |
| **Integrity** | HMAC-SHA256 with independent key (or HKDF-derived). Binds key name + ciphertext + IV + encrypted DEK + DEK IV. |
| **Key derivation** | HKDF-SHA256 with fixed application salt `"secret-vault-hmac-v1"` and info `"hmac-integrity"`. |
| **E2E encryption** | age (X25519 + ChaCha20-Poly1305). Client-side, server never sees plaintext. |
| **Credential hashing** | SHA-256 for service token secrets. Timing-safe comparison via constant-time XOR loop. |
| **Audit chain** | SHA-256 hash of `prevId|prevHash|timestamp|method|identity|action|secretKey`. |

## Dependencies

The Worker uses only three runtime dependencies:
- `hono` + `@hono/zod-openapi` - HTTP framework and schema validation
- `jose` - JWT verification (JWKS)

All cryptographic operations use the Web Crypto API (`crypto.subtle`), built into the Cloudflare Workers runtime. No third-party crypto libraries.

