import type { AuthMode } from "./config.js";

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

export interface VaultError {
  error: string;
}

export class VaultClient {
  private auth: AuthMode;

  constructor(auth: AuthMode) {
    this.auth = auth;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };

    if (this.auth.type === "service_token") {
      h["CF-Access-Client-Id"] = this.auth.clientId;
      h["CF-Access-Client-Secret"] = this.auth.clientSecret;
    } else {
      // Send JWT both as cookie (for Access) and header (for Worker directly)
      h.Cookie = `CF_Authorization=${this.auth.jwt}`;
      h["Cf-Access-Jwt-Assertion"] = this.auth.jwt;
    }

    return h;
  }

  private get base(): string {
    return this.auth.url.replace(/\/+$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: this.headers,
        redirect: "manual",
        signal: controller.signal,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Cloudflare Access redirects to login page when session is expired/invalid
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("Location") || "";
        try {
          const parsed = new URL(location);
          if (
            parsed.hostname.endsWith(".cloudflareaccess.com") ||
            parsed.pathname.startsWith("/cdn-cgi/access/")
          ) {
            throw new Error("Session expired or unauthorized. Run `hfs login` to re-authenticate.");
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("Session expired")) throw e;
          // Relative URL or parse failure — check pathname directly
          if (location.startsWith("/cdn-cgi/access/")) {
            throw new Error("Session expired or unauthorized. Run `hfs login` to re-authenticate.");
          }
        }
        throw new Error(`Unexpected redirect (HTTP ${res.status}) to ${location}`);
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          `Non-JSON response (HTTP ${res.status}). Is the vault URL correct and the Worker deployed?`,
        );
      }

      if (!res.ok) {
        const err = data as VaultError;
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      return data as T;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("Request timed out after 30s. Check your connection and vault URL.");
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  // --- Secrets ---

  async list(opts?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ secrets: SecretEntry[]; total: number }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));
    if (opts?.search) params.set("search", opts.search);
    const q = params.toString() ? `?${params}` : "";
    return this.request("GET", `/secrets${q}`);
  }

  async get(key: string): Promise<SecretEntry> {
    return this.request<SecretEntry>("GET", `/secrets/${encodeURIComponent(key)}`);
  }

  async set(
    key: string,
    value: string,
    opts?: { description?: string; tags?: string; expires_at?: string | null },
  ): Promise<{ ok: boolean; key: string }> {
    return this.request("PUT", `/secrets/${encodeURIComponent(key)}`, {
      value,
      description: opts?.description || "",
      tags: opts?.tags || "",
      expires_at: opts?.expires_at ?? null,
    });
  }

  async delete(key: string): Promise<{ ok: boolean; deleted: string }> {
    return this.request("DELETE", `/secrets/${encodeURIComponent(key)}`);
  }

  async exportAll(): Promise<SecretEntry[]> {
    const data = await this.request<{ secrets: SecretEntry[] }>("GET", "/secrets/export");
    return data.secrets;
  }

  async importAll(
    secrets: {
      key: string;
      value: string;
      description?: string;
      tags?: string;
      expires_at?: string | null;
    }[],
    overwrite = false,
  ): Promise<{ ok: boolean; imported: number; skipped: number }> {
    return this.request("POST", "/secrets/import", { secrets, overwrite });
  }

  // --- Service token management ---

  async listTokens(): Promise<ServiceTokenEntry[]> {
    const data = await this.request<{ tokens: ServiceTokenEntry[] }>("GET", "/tokens");
    return data.tokens;
  }

  async registerToken(
    clientId: string,
    name: string,
    opts?: { description?: string; scopes?: string; role?: string },
  ): Promise<{ ok: boolean; client_id: string }> {
    return this.request("PUT", `/tokens/${encodeURIComponent(clientId)}`, {
      name,
      description: opts?.description || "",
      scopes: opts?.scopes || "*",
      role: opts?.role,
    });
  }

  async revokeToken(clientId: string): Promise<{ ok: boolean; revoked: string }> {
    return this.request("DELETE", `/tokens/${encodeURIComponent(clientId)}`);
  }

  // --- Audit ---

  async audit(opts?: {
    limit?: number;
    offset?: number;
    identity?: string;
    action?: string;
    key?: string;
    method?: string;
    from?: string;
    to?: string;
  }): Promise<AuditEntry[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));
    if (opts?.identity) params.set("identity", opts.identity);
    if (opts?.action) params.set("action", opts.action);
    if (opts?.key) params.set("key", opts.key);
    if (opts?.method) params.set("method", opts.method);
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    const q = params.toString() ? `?${params}` : "";
    const data = await this.request<{ entries: AuditEntry[] }>("GET", `/audit${q}`);
    return data.entries;
  }

  // --- Flags ---

  async listFlags(): Promise<FlagEntry[]> {
    const data = await this.request<{ flags: FlagEntry[] }>("GET", "/flags");
    return data.flags;
  }

  async getFlag(key: string): Promise<FlagEntry> {
    return this.request("GET", `/flags/${encodeURIComponent(key)}`);
  }

  async setFlag(key: string, value: unknown, description?: string): Promise<FlagEntry> {
    return this.request("PUT", `/flags/${encodeURIComponent(key)}`, {
      value,
      description: description || "",
    });
  }

  async deleteFlag(key: string): Promise<{ ok: boolean; deleted: string }> {
    return this.request("DELETE", `/flags/${encodeURIComponent(key)}`);
  }

  // --- Admin operations ---

  async reEncrypt(): Promise<{ ok: boolean; migrated: number; skipped: number }> {
    return this.request("POST", "/admin/re-encrypt");
  }

  async rotateKey(newKey: string): Promise<{ ok: boolean; rotated: number; legacy: number }> {
    return this.request("POST", "/admin/rotate-key", { new_key: newKey });
  }

  // --- Versions ---

  async listVersions(
    key: string,
  ): Promise<{ id: number; changed_by: string; changed_at: string }[]> {
    const data = await this.request<{
      versions: { id: number; changed_by: string; changed_at: string }[];
    }>("GET", `/secrets/${encodeURIComponent(key)}/versions`);
    return data.versions;
  }

  async getVersion(
    key: string,
    id: number,
  ): Promise<{
    id: number;
    key: string;
    value: string;
    description: string;
    changed_by: string;
    changed_at: string;
  }> {
    return this.request("GET", `/secrets/${encodeURIComponent(key)}/versions/${id}`);
  }

  async restoreVersion(
    key: string,
    id: number,
  ): Promise<{ ok: boolean; key: string; restored_from: number }> {
    return this.request("POST", `/secrets/${encodeURIComponent(key)}/versions/${id}/restore`);
  }

  // --- Users ---

  async listUsers(): Promise<UserEntry[]> {
    const data = await this.request<{ users: UserEntry[] }>("GET", "/users");
    return data.users;
  }

  async addUser(
    email: string,
    role: string,
    name?: string,
  ): Promise<{ ok: boolean; email: string }> {
    return this.request("PUT", `/users/${encodeURIComponent(email)}`, {
      email,
      name: name || "",
      role,
    });
  }

  async updateUser(
    email: string,
    updates: { name?: string; role?: string; enabled?: boolean },
  ): Promise<{ ok: boolean; email: string }> {
    return this.request("PATCH", `/users/${encodeURIComponent(email)}`, updates);
  }

  async deleteUser(email: string): Promise<{ ok: boolean; deleted: string }> {
    return this.request("DELETE", `/users/${encodeURIComponent(email)}`);
  }

  // --- Roles ---

  async listRoles(): Promise<RoleEntry[]> {
    const data = await this.request<{ roles: RoleEntry[] }>("GET", "/roles");
    return data.roles;
  }

  async setRole(
    name: string,
    scopes: string,
    description?: string,
    allowedTags?: string,
  ): Promise<{ ok: boolean; name: string }> {
    return this.request("PUT", `/roles/${encodeURIComponent(name)}`, {
      name,
      scopes,
      allowed_tags: allowedTags || "",
      description: description || "",
    });
  }

  async deleteRole(name: string): Promise<{ ok: boolean; deleted: string }> {
    return this.request("DELETE", `/roles/${encodeURIComponent(name)}`);
  }

  // --- Info ---

  async whoami(): Promise<{
    method: string;
    identity: string;
    name: string;
    role: string;
    scopes: string[];
  }> {
    return this.request("GET", "/whoami");
  }
}
