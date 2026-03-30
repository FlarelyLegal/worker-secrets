# VaultClient interface

Source: `hfs/src/client.ts`, `hfs/src/types.ts`

## Types

```typescript
interface SecretEntry {
  key: string;
  value?: string;
  description: string;
  tags: string;
  expires_at: string | null;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

interface ServiceTokenEntry {
  client_id: string;
  name: string;
  description: string;
  scopes: string;
  role: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

interface UserEntry {
  email: string;
  name: string;
  role: string;
  enabled: number;
  age_public_key: string | null;
  zt_fingerprint: string;
  last_login_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

interface RoleEntry {
  name: string;
  scopes: string;
  allowed_tags: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

interface AuditEntry {
  id: number;
  timestamp: string;
  method: string;
  identity: string;
  action: string;
  secret_key: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  prev_hash: string | null;
}

interface FlagEntry {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
  type: "string" | "number" | "boolean" | "json";
  description: string;
  updated_by: string;
  updated_at: string;
}

interface RecipientEntry {
  email: string;
  name: string;
  age_public_key: string;
}

interface ConsumerEntry {
  identity: string;
  user_agent: string | null;
  method: string;
  access_count: number;
  last_accessed: string;
  first_accessed: string;
}
```

## VaultClient methods

```typescript
class VaultClient {
  // Secrets
  list(opts?: { limit?: number; offset?: number; search?: string }): Promise<{ secrets: SecretEntry[]; total: number }>
  get(key: string): Promise<SecretEntry>
  set(key: string, value: string, opts?: { description?: string; tags?: string; expires_at?: string | null }): Promise<{ ok: boolean; key: string }>
  delete(key: string): Promise<{ ok: boolean; deleted: string }>
  exportAll(): Promise<SecretEntry[]>
  importAll(secrets: { key: string; value: string; description?: string; tags?: string; expires_at?: string | null }[], overwrite?: boolean): Promise<{ ok: boolean; imported: number; skipped: number }>

  // Admin operations
  reEncrypt(): Promise<{ ok: boolean; migrated: number; skipped: number }>
  rotateKey(newKey: string): Promise<{ ok: boolean; rotated: number; legacy: number }>

  // Versions
  listVersions(key: string): Promise<{ id: number; changed_by: string; changed_at: string }[]>
  getVersion(key: string, id: number): Promise<{ id: number; key: string; value: string; description: string; changed_by: string; changed_at: string }>
  restoreVersion(key: string, id: number): Promise<{ ok: boolean; key: string; restored_from: number }>

  // Service tokens
  listTokens(): Promise<ServiceTokenEntry[]>
  registerToken(clientId: string, name: string, opts?: { description?: string; scopes?: string; role?: string }): Promise<{ ok: boolean; client_id: string }>
  revokeToken(clientId: string): Promise<{ ok: boolean; revoked: string }>

  // Users (admin only)
  listUsers(): Promise<UserEntry[]>
  addUser(email: string, role: string, name?: string): Promise<{ ok: boolean; email: string }>
  updateUser(email: string, updates: { name?: string; role?: string; enabled?: boolean; age_public_key?: string | null; zt_fingerprint?: string }): Promise<{ ok: boolean; email: string }>
  deleteUser(email: string): Promise<{ ok: boolean; deleted: string }>

  // Recipients (users with age_public_key set)
  listRecipients(tags?: string): Promise<RecipientEntry[]>

  // Roles (admin only)
  listRoles(): Promise<RoleEntry[]>
  setRole(name: string, scopes: string, description?: string, allowedTags?: string): Promise<{ ok: boolean; name: string }>
  deleteRole(name: string): Promise<{ ok: boolean; deleted: string }>

  // Policies (admin only)
  listPolicies(role: string): Promise<{ id: number; scopes: string; tags: string; description: string }[]>
  setPolicies(role: string, policies: { scopes: string; tags?: string; description?: string }[]): Promise<{ ok: boolean; count: number }>

  // Audit
  audit(opts?: { limit?: number; offset?: number; identity?: string; action?: string; key?: string; method?: string; from?: string; to?: string }): Promise<AuditEntry[]>
  auditConsumers(key: string, opts?: { from?: string; to?: string }): Promise<ConsumerEntry[]>

  // Feature flags
  listFlags(): Promise<FlagEntry[]>
  getFlag(key: string): Promise<FlagEntry>
  setFlag(key: string, value: unknown, description?: string): Promise<FlagEntry>
  deleteFlag(key: string): Promise<{ ok: boolean; deleted: string }>

  // Info
  whoami(): Promise<{ method: string; identity: string; name: string; role: string; scopes: string[]; e2e?: boolean; deviceBound?: boolean; policies?: number; lastLogin?: string | null; totalSecrets?: number; warp?: { connected: boolean; ztVerified: boolean; deviceId?: string } }>
}
```

## Internal helpers

- `request<T>(method, path, body?)` - handles auth headers, JSON parse, error throwing, 30s timeout
- Auth headers set automatically based on `AuthMode` (jwt cookie + header, or service token headers)
- WARP ZT challenge-response headers (`X-ZT-Response`, `X-ZT-Timestamp`) added automatically when available

## Copy/rename (CLI-only)

`hfs cp` copies a secret to a new key. With `--move`, it deletes the source after copying. This is implemented at the CLI level using `get()` + `set()` + `delete()` - there is no `cp` method on `VaultClient`.
