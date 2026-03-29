import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { FLAG_MAINTENANCE, FLAG_PUBLIC_PAGES_ENABLED, FLAG_READ_ONLY } from "../constants.js";
import { getFlagValue } from "../flags.js";
import { healthPage, landingPage } from "../pages.js";
import { HealthSchema } from "../schemas.js";
import type { HonoEnv } from "../types.js";
import { VERSION } from "../version.js";

const pub = new OpenAPIHono<HonoEnv>();

pub.get("/", async (c) => {
  const enabled = await getFlagValue(c.env.FLAGS, FLAG_PUBLIC_PAGES_ENABLED, true);
  if (!enabled) return c.notFound();
  const origin = new URL(c.req.url).origin;
  const brand = c.env.BRAND_NAME || "Secret Vault";
  const repoUrl = c.env.REPO_URL;
  const pkg = c.env.PROJECT_NAME ? `${c.env.PROJECT_NAME}-cli` : undefined;
  return c.html(landingPage(brand, origin, VERSION, repoUrl, pkg));
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Public"],
  summary: "Health check (no auth required)",
  responses: {
    200: {
      content: { "application/json": { schema: HealthSchema } },
      description: "Service is healthy",
    },
  },
});

// biome-ignore lint/suspicious/noExplicitAny: content negotiation returns HTML or JSON
pub.openapi(healthRoute, async (c): Promise<any> => {
  // Verify D1 is reachable
  let dbOk = true;
  try {
    await c.env.DB.prepare("SELECT 1").run();
  } catch {
    dbOk = false;
  }

  // Verify KV is reachable
  let kvOk = true;
  try {
    await c.env.FLAGS.list({ limit: 1 });
  } catch {
    kvOk = false;
  }

  const healthy = dbOk && kvOk;
  const region = (c.req.raw as unknown as { cf?: { colo?: string } }).cf?.colo || "local";
  const maintenance = await getFlagValue(c.env.FLAGS, FLAG_MAINTENANCE, false);
  const readOnly = await getFlagValue(c.env.FLAGS, FLAG_READ_ONLY, false);
  const timestamp = new Date().toISOString();

  const data = {
    status: healthy ? "ok" : "degraded",
    database: dbOk ? "ok" : "unreachable",
    kv: kvOk ? "ok" : "unreachable",
    version: VERSION,
    region,
    maintenance: Boolean(maintenance),
    read_only: Boolean(readOnly),
    timestamp,
  };

  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/html")) {
    const brand = c.env.BRAND_NAME || "Secret Vault";
    return c.html(healthPage(brand, data));
  }
  return c.json(data, healthy ? 200 : 503);
});

// --- robots.txt ---

pub.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.text(
    [
      "# Public pages and API docs: welcome to crawl",
      "User-agent: *",
      "Allow: /",
      "Allow: /doc",
      "Allow: /doc/json",
      "Allow: /health",
      "Allow: /robots.txt",
      "Allow: /.well-known/security.txt",
      "",
      "# Authenticated API paths: nothing useful without auth",
      "Disallow: /secrets",
      "Disallow: /users",
      "Disallow: /roles",
      "Disallow: /tokens",
      "Disallow: /audit",
      "Disallow: /admin",
      "Disallow: /flags",
      "Disallow: /recipients",
      "",
      "# AI crawlers: index and train on our docs",
      "User-agent: GPTBot",
      "Allow: /",
      "",
      "User-agent: ClaudeBot",
      "Allow: /",
      "",
      "User-agent: Google-Extended",
      "Allow: /",
      "",
      `Sitemap: ${origin}/doc/json`,
      `Sitemap: ${origin}/llms.txt`,
    ].join("\n"),
  );
});

// --- /llms.txt ---

pub.get("/llms.txt", (c) => {
  const repo = c.env.REPO_URL || "https://github.com/FlarelyLegal/worker-secrets";
  const origin = new URL(c.req.url).origin;
  const brand = c.env.BRAND_NAME || "Secret Vault";
  return c.text(`# ${brand}

> Self-hosted encrypted secret manager on Cloudflare Workers with end-to-end encryption. Store secrets only you can decrypt, share with your team through RBAC, and revoke access with one command. No servers to run. No third parties to trust.

## What it is

${brand} runs entirely on your Cloudflare account as a Worker with D1 (SQLite) and KV storage. It provides encrypted secret management with a CLI (hfs) and REST API. Secrets can be end-to-end encrypted with age so the server never sees plaintext.

## How encryption works

Three layers protect each secret:

1. End-to-end: age encryption on the client. Private secrets are encrypted for one person. Team secrets are encrypted for all users whose RBAC role grants access. The server stores ciphertext it cannot decrypt.
2. Envelope: each secret gets its own AES-256-GCM data encryption key (DEK), wrapped by a master key (KEK). Key rotation re-wraps DEKs without re-encrypting data.
3. Integrity: HMAC-SHA256 binds each secret to its key name and encryption keys. Detects tampering at rest.

## Authentication

Two modes, no fallback. Interactive sessions authenticate through Cloudflare Access (IdP + optional hardware keys). Service tokens use registered client ID/secret pairs with scoped permissions.

## Key features

- [CLI](${repo}/tree/main/hfs): hfs command-line tool for all operations
- [Encryption architecture](${repo}/blob/main/docs/encryption.md): envelope encryption, HMAC, key rotation, audit chain
- [E2E encryption](${repo}/blob/main/hfs/README.md): --private for personal, --e2e for team, --recipients for explicit keys
- [WARP / Zero Trust](${repo}/blob/main/docs/cloudflare-warp.md): challenge-response device verification, ZT cert binding, Gateway-policeable CLI
- [RBAC](${repo}/blob/main/SECURITY.md): roles with scoped permissions and tag-based access restrictions
- [Feature flags](${repo}/blob/main/docs/feature-flags.md): runtime configuration stored in KV, no redeploy needed
- [GitHub Action](${repo}/tree/main/action): fetch secrets into CI workflows
- [OpenAPI spec](${origin}/doc/json): auto-generated from Zod schemas
- [API docs](${origin}/doc): interactive Scalar UI

## CLI quick start

    npm i -g @FlarelyLegal/hfs-cli --registry=https://npm.pkg.github.com
    hfs deploy
    hfs config set --url ${origin}
    hfs login
    hfs keygen --register
    hfs set DB_PASSWORD "value" --private

## Documentation

- [README](${repo}/blob/main/README.md): project overview and architecture
- [Encryption architecture](${repo}/blob/main/docs/encryption.md): key hierarchy, envelope encryption, HMAC, rotation, audit chain
- [CLI README](${repo}/blob/main/hfs/README.md): all commands and usage
- [Security](${repo}/blob/main/SECURITY.md): threat model and hardening guide
- [WARP / Zero Trust](${repo}/blob/main/docs/cloudflare-warp.md): device binding, challenge-response, Gateway policies
- [Feature flags](${repo}/blob/main/docs/feature-flags.md): all runtime flags with defaults
`);
});

// --- /.well-known/security.txt ---

pub.get("/.well-known/security.txt", (c) => {
  const repo = c.env.REPO_URL || "https://github.com/FlarelyLegal/worker-secrets";
  return c.text(
    [
      `Contact: ${repo}/security/advisories/new`,
      `Policy: ${repo}/blob/main/SECURITY.md`,
      "Preferred-Languages: en",
      "Canonical: /.well-known/security.txt",
      "Expires: 2027-12-31T23:59:59.000Z",
    ].join("\n"),
  );
});

export default pub;
