# HFS Secrets Action

Fetch secrets from your [HFS vault](https://github.com/FlarelyLegal/worker-secrets) and inject them into your GitHub Actions workflow.

## Usage

```yaml
- uses: FlarelyLegal/worker-secrets/action@main
  with:
    url: ${{ secrets.HFS_URL }}
    client-id: ${{ secrets.HFS_CLIENT_ID }}
    client-secret: ${{ secrets.HFS_CLIENT_SECRET }}
    secrets: |
      DB_PASSWORD
      API_KEY
      DEPLOY_TOKEN
```

Secrets are automatically:
- Set as **environment variables** (uppercased, dashes → underscores)
- **Masked** in workflow logs
- Available as a **JSON output** for further processing

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | Yes | | Vault URL |
| `client-id` | Yes | | Service token client ID |
| `client-secret` | Yes | | Service token client secret |
| `secrets` | Yes | | Newline-separated secret keys |
| `export` | No | `true` | Set as environment variables |
| `mask` | No | `true` | Mask values in logs |

## Outputs

| Output | Description |
|--------|-------------|
| `secrets` | JSON object of fetched secrets (`{"key": "value", ...}`) |

## Examples

### Basic usage

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: FlarelyLegal/worker-secrets/action@main
        with:
          url: ${{ secrets.HFS_URL }}
          client-id: ${{ secrets.HFS_CLIENT_ID }}
          client-secret: ${{ secrets.HFS_CLIENT_SECRET }}
          secrets: |
            DEPLOY_KEY
            DB_PASSWORD

      - run: echo "Deploying with secrets loaded"
        # $DEPLOY_KEY and $DB_PASSWORD are now available
```

### Use output JSON

```yaml
- uses: FlarelyLegal/worker-secrets/action@main
  id: vault
  with:
    url: ${{ secrets.HFS_URL }}
    client-id: ${{ secrets.HFS_CLIENT_ID }}
    client-secret: ${{ secrets.HFS_CLIENT_SECRET }}
    secrets: API_KEY

- run: echo '${{ steps.vault.outputs.secrets }}' | jq .API_KEY
```

## Prerequisites

Register a service token with `read` scope:

```bash
hfs token register your-ci.access -n github-ci -s read
```

Store `HFS_URL`, `HFS_CLIENT_ID`, and `HFS_CLIENT_SECRET` as GitHub repository secrets.
