export interface Env {
  DB: D1Database;
  FLAGS: KVNamespace;
  ENCRYPTION_KEY: string; // 64-char hex string (32 bytes) - master KEK
  INTEGRITY_KEY?: string; // optional separate HMAC key (64-char hex, falls back to HKDF derivation)
  ALLOWED_EMAILS?: string; // fallback if users table is empty (comma-separated)
  TEAM_DOMAIN: string; // https://<team>.cloudflareaccess.com
  POLICY_AUD: string; // Access application AUD tag
  PROJECT_NAME?: string; // worker/DB name prefix (default: "secret-vault")
  BRAND_NAME?: string; // display name in UI (default: "Secret Vault")
  REPO_URL?: string; // GitHub repo URL for landing page links
  CORS_ORIGINS?: string; // comma-separated allowed origins (empty = no CORS)
  ZT_CA_FINGERPRINT?: string; // SHA-256 fingerprint of org's Zero Trust CA (hex, no colons)
  DEV_AUTH_BYPASS?: string; // "true" in .dev.vars only - never set in production
}

export type PolicyRule = {
  scopes: string[];
  tags: string[];
};

export type AuthUser = {
  method: "interactive" | "service_token";
  identity: string;
  name: string;
  role: string;
  scopes: string[];
  allowedTags: string[]; // empty = all tags allowed (legacy, derived from policies)
  policies: PolicyRule[];
  warp?: { connected: boolean; ztVerified: boolean; deviceId?: string };
};

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthUser;
    ip: string | null;
    ua: string | null;
    requestId: string;
    flags: Map<string, unknown>;
  };
};
