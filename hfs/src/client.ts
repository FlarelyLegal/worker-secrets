import type { AuthMode } from "./config.js";

export interface SecretEntry {
  key: string;
  value?: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceTokenEntry {
  client_id: string;
  name: string;
  description: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  method: string;
  identity: string;
  action: string;
  secret_key: string | null;
  ip: string | null;
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
      // JWT from cloudflared — send as CF_Authorization cookie
      h.Cookie = `CF_Authorization=${this.auth.jwt}`;
    }

    return h;
  }

  private get base(): string {
    return this.auth.url.replace(/\/+$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: this.headers,
      redirect: "manual",
      body: body ? JSON.stringify(body) : undefined,
    });

    // Cloudflare Access redirects to login page when session is expired/invalid
    if (res.status >= 300 && res.status < 400) {
      throw new Error("Session expired or unauthorized. Run `hfs login` to re-authenticate.");
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
  }

  // --- Secrets ---

  async list(): Promise<SecretEntry[]> {
    const data = await this.request<{ secrets: SecretEntry[] }>("GET", "/secrets");
    return data.secrets;
  }

  async get(key: string): Promise<SecretEntry> {
    return this.request<SecretEntry>("GET", `/secrets/${encodeURIComponent(key)}`);
  }

  async set(
    key: string,
    value: string,
    description?: string,
  ): Promise<{ ok: boolean; key: string }> {
    return this.request("PUT", `/secrets/${encodeURIComponent(key)}`, {
      value,
      description: description || "",
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
    secrets: { key: string; value: string; description?: string }[],
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
    opts?: { description?: string; scopes?: string },
  ): Promise<{ ok: boolean; client_id: string }> {
    return this.request("PUT", `/tokens/${encodeURIComponent(clientId)}`, {
      name,
      description: opts?.description || "",
      scopes: opts?.scopes || "*",
    });
  }

  async revokeToken(clientId: string): Promise<{ ok: boolean; revoked: string }> {
    return this.request("DELETE", `/tokens/${encodeURIComponent(clientId)}`);
  }

  // --- Audit ---

  async audit(limit?: number): Promise<AuditEntry[]> {
    const q = limit ? `?limit=${limit}` : "";
    const data = await this.request<{ entries: AuditEntry[] }>("GET", `/audit${q}`);
    return data.entries;
  }

  // --- Info ---

  async whoami(): Promise<{ method: string; identity: string; name: string; scopes: string[] }> {
    return this.request("GET", "/whoami");
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "/health");
  }
}
