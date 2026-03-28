# hfs — Encrypted Secret Vault CLI

CLI for managing your encrypted secret vault on Cloudflare Workers.

[![GitHub Package](https://img.shields.io/badge/GitHub-Package-181717?logo=github&logoColor=white)](https://github.com/FlarelyLegal/worker-secrets/packages)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Commander.js](https://img.shields.io/badge/Commander.js-red)](https://github.com/tj/commander.js)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

[![skill: add-command](https://img.shields.io/badge/skill-add--command-5D5CDE)](../.agents/skills/add-command/SKILL.md)
[![skill: deploy](https://img.shields.io/badge/skill-deploy-5D5CDE)](../.agents/skills/deploy/SKILL.md)

## Install

```bash
npm install -g @FlarelyLegal/hfs-cli --registry=https://npm.pkg.github.com
```

Requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for interactive login.

## Auth

Two modes, no fallback. They never mix.

**Human** — `hfs login` opens browser via cloudflared, you tap your YubiKey. Short-lived JWT stored locally.

**Machine** — Set `HFS_URL`, `HFS_CLIENT_ID`, `HFS_CLIENT_SECRET` env vars. Must correspond to a registered service token.

## Commands

### Secrets
```
hfs get <key>              Get a decrypted secret
hfs get <key> -q           Print only the value (pipe-friendly)
hfs get <key> -j           Output as JSON
hfs set <key> <value>      Store a secret
hfs set <key> --from-file  Read value from a file
hfs set <key> -t <tags>    Set with comma-separated tags
hfs rm <key>               Delete a secret (confirms first)
hfs ls                     List all secret keys
hfs versions <key>         List version history
hfs restore <key> <id>     Restore a previous version
hfs env <key> [key...]     Output as KEY=value (dashes → underscores)
hfs env -e <key> [key...]  Same with export prefix
hfs export                 Export all as JSON (includes tags)
hfs import <file>          Import from JSON
```

### Auth & config
```
hfs login                  Authenticate via cloudflared
hfs logout                 Clear stored session
hfs whoami                 Show auth method, role, and scopes
hfs whoami -j              Output as JSON
hfs health                 Check vault connectivity (no auth)
hfs config set --url <url> Set vault URL
hfs config show            Show config + auth status
hfs config clear           Clear all config
```

### Users (admin only)
```
hfs user ls                List all users
hfs user add <email> -r <role> [-n <name>]  Add or update a user
hfs user rm <email>        Remove a user
hfs user disable <email>   Disable without deleting
hfs user enable <email>    Re-enable a disabled user
hfs user role <email> <role>  Change a user's role
```

### Roles (admin only)
```
hfs role ls                List all roles with scopes
hfs role set <name> <scopes> [-d <desc>]  Create or update a role
hfs role rm <name>         Delete a role (must have no users)
```

### Service tokens (interactive only)
```
hfs token register <id> -n <name> [-s <scopes>] [-r <role>] [-d <desc>]
hfs token revoke <id>      Revoke a token
hfs token ls               List tokens with last-used times
```

### Feature flags
```
hfs flag ls                List all flags
hfs flag get <key>         Get a flag value (-q for value only, -j for JSON)
hfs flag set <key> <value> Set a flag (auto-detects type)
hfs flag rm <key>          Delete a flag
```

Auto-type detection: `"true"`/`"false"` become boolean, numeric strings become number, valid JSON objects become json, everything else is string. Flags are plaintext KV, not encrypted like secrets.

### Admin
```
hfs audit [-n 100] [-j]    View audit log
hfs audit --action get     Filter by action
hfs audit --identity <email> Filter by identity
hfs audit --key <key>      Filter by secret key
hfs audit --from/--to <date> Filter by date range
hfs deploy                 Deploy the Worker to Cloudflare
hfs completion bash|zsh    Generate shell completions
```

## Scopes

`read`, `write`, `delete`, or `*` (default). Combine: `read,write`

## Examples

```bash
# Load secrets into shell
eval $(hfs env -e API_KEY DB_PASSWORD)

# Pipe into tools
hfs get github-token -q | gh auth login --with-token

# Store a cert from file
hfs set tls-cert --from-file ./cert.pem -d "Prod TLS"

# Backup and restore
hfs export > backup.json
hfs import backup.json --overwrite

# Register a read-only CI token
hfs token register abc.access -n ci-pipeline -s read

# Audit
hfs audit -n 50
```

## Shell integration

Load secrets into your shell on startup. Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Load secrets from vault (requires hfs login session)
if command -v hfs &>/dev/null && hfs health &>/dev/null 2>&1; then
  eval $(hfs env -e CLOUDFLARE_API_KEY GITHUB_TOKEN 2>/dev/null)
fi
```

This silently skips if `hfs` isn't installed, the vault is unreachable, or the session is expired. Secrets are fetched fresh on each shell startup.

For CI/CD, use service token env vars instead:

```bash
export HFS_URL=https://vault.example.com
export HFS_CLIENT_ID=abc123.access
export HFS_CLIENT_SECRET=your-secret
eval $(hfs env -e DEPLOY_KEY DB_PASSWORD)
```

## Backup and restore

```bash
# Export all secrets (decrypted JSON)
hfs export > vault-backup.json

# Restore to same or different vault
hfs import vault-backup.json --overwrite
```

The export file contains decrypted values. Store it securely and delete after use. If you change the `ENCRYPTION_KEY`, existing secrets become unreadable. Export first, rotate the key, then re-import.

## Security

- **RBAC**: role-based access control — admin, operator, reader (custom roles supported)
- **No fallback**: expired JWT or partial env vars = hard error
- **No credentials on disk**: config holds URL + short-lived JWT only
- **All access audited**: every operation logged with identity, IP, user agent, and request ID
- **Unregistered tokens rejected**: Access token alone is not enough
- **HMAC integrity**: every secret cryptographically bound to its key name, tamper-evident at rest
