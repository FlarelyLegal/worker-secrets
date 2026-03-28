declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ENCRYPTION_KEY: string;
    ALLOWED_EMAILS: string;
    TEAM_DOMAIN: string;
    POLICY_AUD: string;
    PROJECT_NAME?: string;
    BRAND_NAME?: string;
    REPO_URL?: string;
    DEV_AUTH_BYPASS?: string;
  }
}
