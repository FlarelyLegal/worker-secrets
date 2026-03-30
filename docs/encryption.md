# Encryption Architecture

How Secret Vault encrypts, authenticates, and protects secrets at rest and in transit.

## Key Hierarchy

```mermaid
graph TD
    KEK["ENCRYPTION_KEY<br/>(KEK - master key)<br/>256-bit AES, Wrangler secret"]
    IK["INTEGRITY_KEY<br/>(HMAC key)<br/>256-bit, Wrangler secret"]
    DEK1["DEK<sub>1</sub><br/>random 256-bit"]
    DEK2["DEK<sub>2</sub><br/>random 256-bit"]
    DEKn["DEK<sub>n</sub><br/>random 256-bit"]
    S1["Secret 1<br/>AES-256-GCM"]
    S2["Secret 2<br/>AES-256-GCM"]
    Sn["Secret n<br/>AES-256-GCM"]
    HMAC1["HMAC<sub>1</sub>"]
    HMAC2["HMAC<sub>2</sub>"]
    HMACn["HMAC<sub>n</sub>"]

    KEK -->|wraps| DEK1
    KEK -->|wraps| DEK2
    KEK -->|wraps| DEKn
    DEK1 -->|encrypts| S1
    DEK2 -->|encrypts| S2
    DEKn -->|encrypts| Sn
    IK -->|signs| HMAC1
    IK -->|signs| HMAC2
    IK -->|signs| HMACn
    HMAC1 -.-|binds| S1
    HMAC2 -.-|binds| S2
    HMACn -.-|binds| Sn

    style KEK fill:#dc2626,color:#fff,stroke:#dc2626
    style IK fill:#ea580c,color:#fff,stroke:#ea580c
    style DEK1 fill:#2563eb,color:#fff,stroke:#2563eb
    style DEK2 fill:#2563eb,color:#fff,stroke:#2563eb
    style DEKn fill:#2563eb,color:#fff,stroke:#2563eb
```

Each secret gets its own random DEK. Compromising one DEK exposes one secret, not the vault. The KEK never touches secret data directly.

## Envelope Encryption

Every write follows this flow:

```mermaid
sequenceDiagram
    participant Client
    participant Worker
    participant Crypto as Web Crypto API
    participant D1

    Client->>Worker: PUT /secrets/{key} + plaintext
    Worker->>Crypto: Generate random 256-bit DEK
    Crypto-->>Worker: DEK (raw bytes)
    Worker->>Crypto: AES-256-GCM encrypt(plaintext, DEK, random IV)
    Crypto-->>Worker: ciphertext + IV
    Worker->>Crypto: AES-256-GCM encrypt(DEK, KEK, random IV)
    Crypto-->>Worker: encrypted_dek + dek_iv
    Worker->>Crypto: HMAC-SHA256(key ‖ ciphertext ‖ IV ‖ encrypted_dek ‖ dek_iv)
    Crypto-->>Worker: integrity tag
    Worker->>D1: Store ciphertext, IV, encrypted_dek, dek_iv, HMAC
    D1-->>Worker: OK
    Worker-->>Client: 200
```

Decryption reverses the process: verify HMAC, unwrap DEK with KEK, decrypt ciphertext with DEK.

## What Gets Stored

```mermaid
erDiagram
    secrets {
        text key PK "secret name"
        text value "AES-256-GCM ciphertext (base64url)"
        text iv "12-byte random IV (base64url)"
        text encrypted_dek "DEK wrapped by KEK (base64url)"
        text dek_iv "DEK wrap IV (base64url)"
        text hmac "HMAC-SHA256 integrity tag (base64url)"
        text tags "comma-separated, for RBAC"
        text expires_at "optional expiry"
    }
```

The database only stores ciphertext. The KEK and INTEGRITY_KEY exist only as Wrangler secrets, available at Worker runtime.

## HMAC Integrity Binding

The HMAC binds all encrypted fields together and to the secret's key name:

```
HMAC-SHA256(INTEGRITY_KEY, key ‖ ":" ‖ ciphertext ‖ ":" ‖ IV ‖ ":" ‖ encrypted_dek ‖ ":" ‖ dek_iv)
```

This detects:
- Ciphertext tampering (modified value in D1)
- DEK swap attacks (replacing encrypted_dek with one from another secret)
- Key name rebinding (copying a row to a different key)

## End-to-End Encryption (age)

For zero-knowledge secrets, an additional client-side layer wraps the plaintext before it reaches the server:

```mermaid
graph LR
    P[Plaintext] -->|age encrypt<br/>client-side| A[age ciphertext]
    A -->|DEK encrypt<br/>server-side| C[Envelope ciphertext]
    C -->|HMAC sign| D1[(D1)]

    style P fill:#16a34a,color:#fff,stroke:#16a34a
    style A fill:#f97316,color:#fff,stroke:#f97316
    style C fill:#2563eb,color:#fff,stroke:#2563eb
```

| Mode | Flag | Who can decrypt | Use for |
|------|------|-----------------|---------|
| Standard | (default) | Anyone with vault access + KEK | Shared infra secrets where server trust is acceptable |
| Private | `--private` | Only the key owner (single age recipient) | Personal tokens, credentials only you need |
| Team E2E | `--e2e` | All RBAC-eligible team members | Shared secrets where the server must not see plaintext |
| Explicit | `--recipients <keys>` | Specific age public keys you list | Cross-team sharing with explicit control |

The server stores age ciphertext as the "plaintext" input to envelope encryption. A compromised Worker or database sees only the age blob. Decryption requires the recipient's age private key.

### Team Lifecycle

```mermaid
sequenceDiagram
    participant New as New Member
    participant Admin
    participant Vault
    participant CLI as hfs CLI

    Note over New,CLI: Onboarding
    New->>CLI: hfs keygen --register
    CLI->>Vault: Store age public key
    Admin->>CLI: hfs rewrap --all
    CLI->>Vault: Re-encrypt e2e secrets<br/>now includes new member

    Note over New,CLI: Offboarding
    Admin->>Vault: hfs user disable alice@co
    Admin->>CLI: hfs rewrap --all
    CLI->>Vault: Re-encrypt e2e secrets<br/>excludes removed member

    Note over New,CLI: Key Rotation
    New->>CLI: hfs keygen --register
    CLI->>Vault: Replace public key
    New->>CLI: hfs rewrap --all
    CLI->>Vault: Re-encrypt with new identity
```

- **Join**: new member runs `keygen --register`, then anyone runs `rewrap --all` to include them
- **Leave**: admin disables the user, then `rewrap --all` to exclude their key
- **Rotate**: member runs `keygen --register` (replaces their public key), then `rewrap --all`

After `rewrap`, the old key can no longer decrypt any e2e secrets. The `--private` secrets are single-recipient - only the owner can rewrap those.

## Key Rotation

Each layer rotates independently. Secret data is never re-encrypted - only wrapping or signing keys change.

### Master key (ENCRYPTION_KEY)

Re-wraps every DEK with a new KEK. Ciphertext is untouched.

```mermaid
sequenceDiagram
    participant Admin
    participant Worker
    participant Crypto as Web Crypto API
    participant D1

    Admin->>Worker: POST /admin/rotate-key + new KEK
    loop Each secret + version
        Worker->>Crypto: Decrypt DEK with old KEK
        Crypto-->>Worker: DEK (raw)
        Worker->>Crypto: Encrypt DEK with new KEK
        Crypto-->>Worker: new encrypted_dek + dek_iv
        Worker->>Crypto: Recompute HMAC with new fields
        Crypto-->>Worker: new integrity tag
        Worker->>D1: UPDATE encrypted_dek, dek_iv, hmac
    end
    Admin->>Admin: wrangler secret put ENCRYPTION_KEY
    Worker-->>Admin: Done
```

```bash
hfs re-encrypt                            # ensure envelope encryption
npm run generate-keys                     # generate new 256-bit key
hfs rotate-key <new-64-char-hex-key>      # re-wrap all DEKs
wrangler secret put ENCRYPTION_KEY        # update Wrangler secret
hfs health && hfs get <any-secret> -q     # verify
```

### Integrity key (INTEGRITY_KEY)

Recomputes all HMACs. Export, delete, and re-import secrets after updating the Wrangler secret.

```bash
openssl rand -hex 32                      # generate new key
wrangler secret put INTEGRITY_KEY         # update Wrangler secret
# redeploy, then re-save all secrets to recompute HMACs
```

### Age identity (e2e key)

Generates a new age keypair and re-encrypts all e2e secrets for the new identity.

```bash
hfs keygen --register                     # new identity, registers public key
hfs rewrap --all                          # re-encrypt all e2e secrets
```

The old identity can no longer decrypt anything after rewrap.

## Audit Hash Chain

Every operation produces a tamper-evident audit entry linked to the previous one:

```mermaid
graph LR
    E0["Entry 0<br/>genesis"] --> E1["Entry 1<br/>hash = SHA-256(0 ‖ genesis ‖ ...)"]
    E1 --> E2["Entry 2<br/>hash = SHA-256(1 ‖ hash₁ ‖ ...)"]
    E2 --> E3["Entry 3<br/>hash = SHA-256(2 ‖ hash₂ ‖ ...)"]
    E3 --> En["..."]
```

Each entry's hash includes:
```
SHA-256(prev_id ‖ prev_hash ‖ timestamp ‖ method ‖ identity ‖ action ‖ secret_key)
```

Modifying or deleting any entry breaks the chain. Verify with `hfs audit-verify`.

Under concurrent inserts, the chain self-heals: if a race condition causes an entry to hash against the wrong predecessor, it detects the mismatch and recomputes.

## Algorithms Summary

| Purpose | Algorithm | Key size | Notes |
|---------|-----------|----------|-------|
| Secret encryption | AES-256-GCM | 256-bit DEK | Per-secret random IV (96-bit) |
| DEK wrapping | AES-256-GCM | 256-bit KEK | Per-wrap random IV |
| Integrity binding | HMAC-SHA256 | 256-bit | Separate INTEGRITY_KEY recommended |
| ZT challenge-response | HMAC-SHA256 | ZT CA fingerprint | Time-based, replay-protected |
| Audit chain | SHA-256 | - | Hash-linked, self-healing, includes timestamp |
| E2E encryption | X25519 + ChaCha20-Poly1305 | via [age](https://age-encryption.org/) | Client-side only |
| Auth tokens | ES256 (P-256) | via Cloudflare Access JWKS | Edge + Worker validation |

All server-side crypto uses the Web Crypto API (`crypto.subtle`), built into the Cloudflare Workers runtime. No third-party crypto libraries.

See [Cloudflare WARP Integration](cloudflare-warp.md) for ZT device binding and challenge-response details.
