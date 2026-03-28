import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ENCRYPTION_KEY: "aa".repeat(32),
          ALLOWED_EMAILS: "test@example.com",
          TEAM_DOMAIN: "https://test.cloudflareaccess.com",
          POLICY_AUD: "test-aud",
          DEV_AUTH_BYPASS: "true",
          BRAND_NAME: "Test Vault",
          PROJECT_NAME: "test-vault",
        },
      },
    }),
  ],
});
