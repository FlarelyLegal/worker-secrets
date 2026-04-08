import type { AuthUser, Env } from "../types.js";
import type { FlagCache } from "../flags.js";

export type ServiceContext = {
  db: D1Database;
  kv: KVNamespace;
  env: Env;
  auth: AuthUser;
  flagCache: FlagCache;
  requestId: string;
  auditFn: (action: string, key: string | null) => Promise<void>;
  waitUntil: (promise: Promise<unknown>) => void;
};

export type RpcOpts = {
  identity?: string;
  role?: string;
  ip?: string | null;
  userAgent?: string;
};

export type SecretListItem = {
  key: string;
  description: string | null;
  tags: string | null;
  expires_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SecretResult = {
  key: string;
  value: string;
  description: string | null;
  tags: string | null;
  expires_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VersionListItem = {
  id: number;
  changed_by: string | null;
  changed_at: string;
};

export type VersionResult = {
  id: number;
  key: string;
  value: string;
  description: string | null;
  changed_by: string | null;
  changed_at: string;
};

export type ExportedSecret = {
  key: string;
  value: string | null;
  description: string | null;
  tags: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  error?: string;
};

export type ServiceToken = {
  client_id: string;
  name: string;
  description: string | null;
  scopes: string | null;
  role: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export type User = {
  email: string;
  name: string | null;
  role: string;
  enabled: number;
  age_public_key: string | null;
  last_login_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

export type Role = {
  name: string;
  scopes: string | null;
  allowed_tags: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

export type Policy = {
  id: number;
  role: string;
  scopes: string;
  tags: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type FlagResult = {
  key: string;
  value: unknown;
  type: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

export type AuditEntry = {
  id: number;
  timestamp: string;
  method: string;
  identity: string;
  action: string;
  secret_key: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  prev_hash: string;
  warp_connected: number;
};

export type AuditConsumer = {
  identity: string;
  user_agent: string | null;
  method: string;
  access_count: number;
  last_accessed: string;
  first_accessed: string;
};

export type Recipient = {
  email: string;
  name: string | null;
  age_public_key: string;
};
