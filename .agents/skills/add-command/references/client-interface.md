# VaultClient interface

Source: `hfs/src/client.ts`

## Types

```typescript
interface SecretEntry {
  key: string;
  value?: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface ServiceTokenEntry {
  client_id: string;
  name: string;
  description: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
}

interface AuditEntry {
  id: number;
  timestamp: string;
  method: string;
  identity: string;
  action: string;
  secret_key: string | null;
  ip: string | null;
}
```

## VaultClient methods

```typescript
class VaultClient {
  // Secrets
  list(): Promise<SecretEntry[]>
  get(key: string): Promise<SecretEntry>
  set(key: string, value: string, description?: string): Promise<{ ok: boolean; key: string }>
  delete(key: string): Promise<{ ok: boolean; deleted: string }>

  // Service tokens
  listTokens(): Promise<ServiceTokenEntry[]>
  registerToken(clientId: string, name: string, opts?: { description?: string; scopes?: string }): Promise<{ ok: boolean; client_id: string }>
  revokeToken(clientId: string): Promise<{ ok: boolean; revoked: string }>

  // Audit
  audit(limit?: number): Promise<AuditEntry[]>

  // Info
  whoami(): Promise<{ method: string; identity: string; name: string; scopes: string[] }>
  health(): Promise<{ status: string }>
}
```

## Internal helpers

- `request<T>(method, path, body?)` — handles auth headers, JSON parse, error throwing
- Auth headers set automatically based on `AuthMode` (jwt cookie or service token headers)
