export interface Env {
  DB: D1Database;
  ENCRYPTION_KEY: string; // 64-char hex string (32 bytes)
  ALLOWED_EMAILS: string; // comma-separated emails for interactive passkey/IdP sessions
  TEAM_DOMAIN: string; // https://<team>.cloudflareaccess.com
  POLICY_AUD: string; // Access application AUD tag
  PROJECT_NAME?: string; // worker/DB name prefix (default: "secret-vault")
  BRAND_NAME?: string; // display name in UI (default: "Secret Vault")
  REPO_URL?: string; // GitHub repo URL for landing page links
  DEV_AUTH_BYPASS?: string; // "true" in .dev.vars only — never set in production
}

export type AuthUser = {
  method: "interactive" | "service_token";
  identity: string;
  name: string;
  scopes: string[];
};

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthUser;
    ip: string | null;
    ua: string | null;
  };
};
