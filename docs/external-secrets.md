# External Secrets Operator Integration

How to sync HomeFlare Secret Vault into Kubernetes using the External Secrets Operator webhook provider.

## Overview

[External Secrets Operator (ESO)](https://external-secrets.io/) is a Kubernetes operator that reads secrets from external APIs and writes them as native Kubernetes `Secret` objects. It reconciles continuously, so any change in the vault is reflected in your cluster within the configured refresh interval.

Using ESO with HomeFlare lets you:

- Reference vault secrets directly in pod environment variables and volume mounts
- Avoid baking credentials into container images or manifests
- Rotate secrets in the vault and have Kubernetes pick up the new value automatically

ESO connects to HomeFlare via its **webhook provider**, which makes authenticated HTTP GET requests to the vault REST API and extracts values from the JSON response.

### Limitation - E2E encrypted secrets

Secrets stored with `--e2e` or `--private` are encrypted client-side with age before reaching the server. The vault API returns the raw age ciphertext, which ESO cannot decrypt. Only standard (non-E2E) secrets are compatible with ESO. Use E2E secrets for credentials that must never leave a developer's machine.

### Prerequisites

- ESO installed in your cluster (`helm install external-secrets external-secrets/external-secrets`)
- A registered service token in the vault (`hfs token register <client_id> -n <name> --secret <secret>`)
- The vault URL (e.g. `https://secrets.example.com`)

---

## Step 1 - Create the service token Secret

Store your service token credentials in a Kubernetes `Secret` in the `external-secrets` namespace. ESO's ClusterSecretStore will reference this secret to authenticate with the vault.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: homeflare-credentials
  namespace: external-secrets
  labels:
    external-secrets.io/type: webhook
stringData:
  client-id: "your-token.access"
  client-secret: "your-token-secret"
```

The `external-secrets.io/type: webhook` label is required - ESO enforces it to allow webhook providers to read the secret.

Apply it:

```bash
kubectl apply -f homeflare-credentials.yaml

# Or create it directly from your token values:
kubectl create secret generic homeflare-credentials \
  --namespace external-secrets \
  --from-literal=client-id="your-token.access" \
  --from-literal=client-secret="your-token-secret"

# Add the required label if creating with kubectl create:
kubectl label secret homeflare-credentials \
  --namespace external-secrets \
  external-secrets.io/type=webhook
```

---

## Step 2 - Create a ClusterSecretStore

The `ClusterSecretStore` is a cluster-scoped resource that defines how ESO connects to the vault. A single store can serve all namespaces.

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: homeflare-vault
spec:
  provider:
    webhook:
      url: "https://secrets.example.com/secrets/{{ .remoteRef.key }}"
      method: GET
      headers:
        CF-Access-Client-Id: "{{ .secrets.creds.client-id }}"
        CF-Access-Client-Secret: "{{ .secrets.creds.client-secret }}"
      secrets:
        - name: creds
          secretRef:
            name: homeflare-credentials
            namespace: external-secrets
      result:
        jsonPath: "$.value"
```

Key points:

- `{{ .remoteRef.key }}` is interpolated at sync time with the key name from each `ExternalSecret` - for example, `DB_PASSWORD`
- `{{ .secrets.creds.client-id }}` references the `client-id` field from the `homeflare-credentials` secret registered under the name `creds`
- `$.value` extracts the `value` field from the vault API response (`{ key, value, description, tags, expires_at, created_at, updated_at }`)

If you prefer namespace-scoped isolation, use a `SecretStore` instead. It has the same `spec.provider` structure but is namespaced and does not require `namespace` on the `secretRef`:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: homeflare-vault
  namespace: my-app
spec:
  provider:
    webhook:
      url: "https://secrets.example.com/secrets/{{ .remoteRef.key }}"
      method: GET
      headers:
        CF-Access-Client-Id: "{{ .secrets.creds.client-id }}"
        CF-Access-Client-Secret: "{{ .secrets.creds.client-secret }}"
      secrets:
        - name: creds
          secretRef:
            name: homeflare-credentials
      result:
        jsonPath: "$.value"
```

Apply the store:

```bash
kubectl apply -f homeflare-cluster-secret-store.yaml
kubectl get clustersecretstore homeflare-vault
# NAME              AGE   STATUS   CAPABILITIES   READY
# homeflare-vault   10s   Valid    ReadOnly       True
```

---

## Step 3 - Create ExternalSecret resources

An `ExternalSecret` declares which vault keys to fetch and how to map them into a Kubernetes `Secret`.

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
  namespace: my-app
spec:
  refreshInterval: 5m
  secretStoreRef:
    name: homeflare-vault
    kind: ClusterSecretStore
  target:
    name: db-credentials
    creationPolicy: Owner
  data:
    - secretKey: password
      remoteRef:
        key: DB_PASSWORD
    - secretKey: connection-string
      remoteRef:
        key: DATABASE_URL
```

This creates (and continuously reconciles) a Kubernetes `Secret` named `db-credentials` in the `my-app` namespace with two keys - `password` and `connection-string` - populated from the vault.

### Fetching multiple secrets

You can declare as many `data` entries as needed, each mapping one vault key to one Kubernetes secret key:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
  namespace: my-app
spec:
  refreshInterval: 10m
  secretStoreRef:
    name: homeflare-vault
    kind: ClusterSecretStore
  target:
    name: app-secrets
    creationPolicy: Owner
  data:
    - secretKey: stripe-key
      remoteRef:
        key: STRIPE_SECRET_KEY
    - secretKey: jwt-secret
      remoteRef:
        key: JWT_SECRET
    - secretKey: redis-url
      remoteRef:
        key: REDIS_URL
```

---

## Step 4 - Use the synced Secret in pods

Once an `ExternalSecret` is synced, the resulting Kubernetes `Secret` is a standard object and can be used anywhere Kubernetes accepts secrets.

### As environment variables

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: my-app:latest
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: password
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: connection-string
```

### As a mounted volume

```yaml
spec:
  containers:
    - name: app
      image: my-app:latest
      volumeMounts:
        - name: secrets
          mountPath: /run/secrets
          readOnly: true
  volumes:
    - name: secrets
      secret:
        secretName: app-secrets
```

Each key in the Kubernetes secret becomes a file under `/run/secrets/`. For example, `/run/secrets/stripe-key` contains the Stripe API key value.

### Injecting all keys as environment variables

```yaml
envFrom:
  - secretRef:
      name: app-secrets
```

This injects every key in `app-secrets` as an environment variable. Use with care - prefer explicit `env` mappings in production to avoid accidentally exposing unexpected keys.

---

## Troubleshooting

### Check sync status

```bash
# List all ExternalSecrets and their sync status
kubectl get externalsecret --all-namespaces

# Inspect a specific ExternalSecret
kubectl describe externalsecret db-credentials -n my-app
```

The `Status.Conditions` section shows whether the last sync succeeded and when it occurred. A healthy resource shows `SecretSynced = True`.

### Check the ClusterSecretStore

```bash
kubectl describe clustersecretstore homeflare-vault
```

The `Status.Conditions` section shows `Valid = True` when ESO can successfully reach the webhook endpoint.

### Common issues

**401 Unauthorized**

The `CF-Access-Client-Id` or `CF-Access-Client-Secret` headers are wrong or the secret was created without the `external-secrets.io/type: webhook` label. Verify:

```bash
kubectl get secret homeflare-credentials -n external-secrets -o jsonpath='{.metadata.labels}'
# Should include: {"external-secrets.io/type":"webhook"}
```

**404 Not Found**

The vault key does not exist. The `remoteRef.key` value in your `ExternalSecret` must exactly match a key name in the vault. Verify with `hfs get <KEY>`.

**JSONPath extraction failure**

ESO could not extract `$.value` from the response. This usually means the vault returned an error body (e.g. a 404 or 500 JSON error object) rather than a secret. Check the ESO controller logs:

```bash
kubectl logs -n external-secrets \
  -l app.kubernetes.io/name=external-secrets \
  --tail=50
```

**Webhook timeout**

The default ESO webhook timeout is 5 seconds. If the vault is behind Cloudflare Access with slow cold starts, add a `timeout` field to the store:

```yaml
spec:
  provider:
    webhook:
      url: "https://secrets.example.com/secrets/{{ .remoteRef.key }}"
      timeout: 10s
      ...
```

**E2E encrypted secret returns garbled value**

Secrets stored with `--e2e` or `--private` cannot be decrypted by the server. The vault returns the age ciphertext as-is. These secrets are not compatible with ESO. See the [Encryption Architecture](./encryption.md) docs for details on E2E modes.

**Secret not updating after vault change**

ESO only polls at the `refreshInterval`. A 5-minute interval means up to 5 minutes of lag. To force an immediate resync, annotate the `ExternalSecret`:

```bash
kubectl annotate externalsecret db-credentials \
  --namespace my-app \
  force-sync=$(date +%s) \
  --overwrite
```
