import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // Pure unit tests — no Workers runtime needed, run in Node pool
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          environment: "node",
        },
      },

      // Workers integration tests — run inside Miniflare via pool-workers
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              kvNamespaces: ["FLAGS"],
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
        test: {
          name: "workers",
          include: ["test/**/*.workers.test.ts", "src/__tests__/**/*.test.ts"],
        },
      },
    ],
  },
});
