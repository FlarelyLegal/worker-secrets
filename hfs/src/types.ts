export interface SecretEntry {
  key: string;
  value?: string;
  description: string;
  tags: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceTokenEntry {
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

export interface UserEntry {
  email: string;
  name: string;
  role: string;
  enabled: number;
  age_public_key: string | null;
  last_login_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export interface RoleEntry {
  name: string;
  scopes: string;
  allowed_tags: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export interface AuditEntry {
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

export interface FlagEntry {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
  type: "string" | "number" | "boolean" | "json";
  description: string;
  updated_by: string;
  updated_at: string;
}

export interface RecipientEntry {
  email: string;
  name: string;
  age_public_key: string;
}

export interface VaultError {
  error: string;
}
