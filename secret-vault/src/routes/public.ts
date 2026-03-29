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
  return c.html(landingPage(brand, origin, repoUrl, pkg));
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
    ].join("\n"),
  );
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
