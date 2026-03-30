# HFS Secrets Action

Securely fetch secrets from your [HFS vault](https://github.com/FlarelyLegal/worker-secrets) into GitHub Actions workflows.

## How it works

1. Your vault runs on Cloudflare Workers behind Cloudflare Access
2. A **registered service token** (not a personal JWT) authenticates the request
3. Each secret is fetched individually over HTTPS via the vault's REST API
4. Values are **masked** in GitHub Actions logs (invisible in all subsequent steps)
5. Secrets are injected as **environment variables** for your workflow steps

No secrets touch disk. No intermediate files. No third-party services.

## Usage

```yaml
- name: Load secrets from vault
  uses: FlarelyLegal/worker-secrets/action@v0.19.0
  with:
    url: ${{ secrets.HFS_URL }}
    client-id: ${{ secrets.HFS_CLIENT_ID }}
    client-secret: ${{ secrets.HFS_CLIENT_SECRET }}
    secrets: |
      DB_PASSWORD
      API_KEY
      DEPLOY_TOKEN

- name: Use secrets
  run: |
    # Secrets are now available as environment variables
    # $DB_PASSWORD, $API_KEY, $DEPLOY_TOKEN
    echo "Deploying with loaded secrets"
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | Yes | | Vault URL (e.g. `https://secrets.example.com`) |
| `client-id` | Yes | | Service token client ID |
| `client-secret` | Yes | | Service token client secret |
| `secrets` | Yes | | Newline-separated secret keys (see [Key mapping](#key-mapping)) |
| `export` | No | `true` | Export secrets as environment variables |
| `mask` | No | `true` | Mask values in GitHub Actions logs |

## Outputs

| Output | Description |
|--------|-------------|
| `json` | JSON object of fetched secrets (`{"key": "value", ...}`) |
| `count` | Number of secrets successfully fetched |

## Key mapping

By default, secret keys are uppercased with dashes/dots converted to underscores:

```yaml
secrets: |
  api-key        # → $API_KEY
  db.password    # → $DB_PASSWORD
```

To map to a specific env var name, use `SECRET_KEY:ENV_NAME`:

```yaml
secrets: |
  api-key:MY_API_KEY           # → $MY_API_KEY
  prod-db-password:DB_PASS     # → $DB_PASS
```

Lines starting with `#` are ignored (comments).

## Examples

### Basic

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: FlarelyLegal/worker-secrets/action@v0.19.0
        with:
          url: ${{ secrets.HFS_URL }}
          client-id: ${{ secrets.HFS_CLIENT_ID }}
          client-secret: ${{ secrets.HFS_CLIENT_SECRET }}
          secrets: |
            DEPLOY_KEY
            DB_PASSWORD

      - run: ./deploy.sh
        # $DEPLOY_KEY and $DB_PASSWORD are available
```

### Use JSON output

```yaml
- uses: FlarelyLegal/worker-secrets/action@v0.19.0
  id: vault
  with:
    url: ${{ secrets.HFS_URL }}
    client-id: ${{ secrets.HFS_CLIENT_ID }}
    client-secret: ${{ secrets.HFS_CLIENT_SECRET }}
    secrets: API_KEY

- run: |
    echo '${{ steps.vault.outputs.json }}' | jq -r '.API_KEY'
```

### Multiple environments

```yaml
- uses: FlarelyLegal/worker-secrets/action@v0.19.0
  with:
    url: ${{ secrets.HFS_URL }}
    client-id: ${{ secrets.HFS_CLIENT_ID }}
    client-secret: ${{ secrets.HFS_CLIENT_SECRET }}
    secrets: |
      prod-db-password:DB_PASSWORD
      prod-api-key:API_KEY
      # staging secrets loaded separately
```

## Prerequisites

1. Register a service token with minimal scopes:

```bash
hfs token register your-ci.access -n github-ci -s read -d "GitHub Actions"
```

2. Store credentials as GitHub repository secrets:
   - `HFS_URL` - your vault URL
   - `HFS_CLIENT_ID` - the service token client ID
   - `HFS_CLIENT_SECRET` - the service token client secret

3. Assign the token a role with only the tags it needs:

```bash
hfs role set ci-reader read --allowed-tags ci
hfs token register your-ci.access -n github-ci -r ci-reader
```

## Security

- **No secrets on disk** - values are passed through environment variables only
- **Masked in logs** - GitHub's masking prevents accidental exposure in log output
- **Minimal scope** - use read-only service tokens with tag restrictions
- **Authenticated** - all requests go through Cloudflare Access with registered service tokens
- **Audited** - every secret fetch is logged in the vault's tamper-evident audit trail
- **HTTPS only** - all communication over TLS to your Cloudflare Worker
- Uses `jq` and `curl` (pre-installed on all GitHub-hosted runners) - no additional dependencies
