import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HealthSchema } from "../schemas.js";
import type { HonoEnv } from "../types.js";

const pub = new OpenAPIHono<HonoEnv>();

// --- Landing page ---

pub.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  const brand = c.env.BRAND_NAME || "Secret Vault";
  const brandInitial = brand.charAt(0).toUpperCase();
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f97316'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='60' fill='white'>${brandInitial}</text></svg>" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #fafafa; --surface: #fff; --border: #e5e5e5;
      --text: #171717; --muted: #737373; --accent: #f97316;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0a0a0a; --surface: #141414; --border: #262626;
        --text: #ededed; --muted: #888;
      }
    }
    body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 540px; width: 100%; padding: 2rem; }
    .brand { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
    .brand-icon { width: 28px; height: 28px; background: var(--accent); border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; color: #fff; }
    .brand-name { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
    h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em; margin-bottom: 0.75rem; }
    .desc { color: var(--muted); font-size: 0.9375rem; line-height: 1.6; margin-bottom: 2rem; }
    .links { display: flex; flex-direction: column; gap: 0.5rem; }
    .link { display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.875rem 1rem; text-decoration: none; color: var(--text); transition: border-color 0.15s, background 0.15s; }
    .link:hover { border-color: var(--muted); background: var(--bg); }
    .link-label { font-size: 0.875rem; font-weight: 500; }
    .link-path { font-family: var(--mono); font-size: 0.75rem; color: var(--muted); }
    .link-arrow { color: var(--muted); font-size: 0.875rem; }
    .footer { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .footer-text { font-size: 0.75rem; color: var(--muted); }
    .status { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: #22c55e; }
    .status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <div class="brand-icon">${brandInitial}</div>
      <span class="brand-name">${brand}</span>
    </div>
    <h1>${brand}</h1>
    <p class="desc">Encrypted secret management powered by Cloudflare Workers and D1. All secrets are encrypted at rest with AES-256-GCM. Authentication is handled through Cloudflare Access with two paths: interactive sessions using your IdP and hardware keys (passkeys, YubiKeys) for humans, and registered service tokens with named identities and scoped permissions for CI pipelines and other services. Every operation is audit-logged.</p>
    <div class="links">
      <a class="link" href="/doc">
        <div>
          <div class="link-label">API Reference</div>
          <div class="link-path">${origin}/doc</div>
        </div>
        <span class="link-arrow">→</span>
      </a>
      <a class="link" href="/doc/json">
        <div>
          <div class="link-label">OpenAPI Spec</div>
          <div class="link-path">${origin}/doc/json</div>
        </div>
        <span class="link-arrow">→</span>
      </a>
      <a class="link" href="/health">
        <div>
          <div class="link-label">Health Check</div>
          <div class="link-path">${origin}/health</div>
        </div>
        <span class="link-arrow">→</span>
      </a>
    </div>
    <div class="footer">
      <span class="footer-text">${brand} · Powered by Cloudflare Workers</span>
      <span class="status">Healthy</span>
    </div>
  </div>
</body>
</html>`);
});

// --- Health check ---

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

pub.openapi(healthRoute, (c) => {
  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/html")) {
    const brand = c.env.BRAND_NAME || "Secret Vault";
    const brandInitial = brand.charAt(0).toUpperCase();
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand} - Health</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f97316'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='60' fill='white'>${brandInitial}</text></svg>" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #fafafa; --surface: #fff; --border: #e5e5e5;
      --text: #171717; --muted: #737373; --accent: #f97316;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0a0a0a; --surface: #141414; --border: #262626; --text: #ededed; --muted: #888; }
    }
    body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 2rem; max-width: 380px; width: 100%; text-align: center; }
    .icon { width: 48px; height: 48px; background: #22c55e; border-radius: 50%; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: center; }
    .icon svg { width: 24px; height: 24px; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    .status { color: #22c55e; font-weight: 600; font-size: 0.875rem; margin-bottom: 1rem; }
    .meta { font-size: 0.75rem; color: var(--muted); }
    .meta span { display: block; margin-top: 0.25rem; }
    a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon"><svg fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <h1>${brand}</h1>
    <div class="status">All systems healthy</div>
    <div class="meta">
      <span>${new Date().toISOString()}</span>
      <span><a href="/">Home</a> · <a href="/doc">API Docs</a></span>
    </div>
  </div>
</body>
</html>`);
  }
  return c.json({ status: "ok" }, 200);
});

export default pub;
