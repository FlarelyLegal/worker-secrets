import { OpenAPIHono } from "@hono/zod-openapi";
import { authenticate } from "./auth.js";
import admin from "./routes/admin.js";
import bulk from "./routes/bulk.js";
import pub from "./routes/public.js";
import secrets from "./routes/secrets.js";
import tokens from "./routes/tokens.js";
import type { HonoEnv } from "./types.js";
import { VERSION } from "./version.js";

const app = new OpenAPIHono<HonoEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0].message }, 400);
    }
  },
});

// Global error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

// --- Public (before auth middleware) ---

app.route("/", pub);

const API_DESCRIPTION =
  "Self-hosted secret management on Cloudflare Workers. " +
  "Secrets are encrypted at rest with AES-256-GCM in a D1 database. " +
  "Two auth paths via Cloudflare Access: interactive sessions (IdP + hardware key) " +
  "for humans, and registered service tokens with named identities and scoped " +
  "permissions (read/write/delete) for CI pipelines and other Workers. " +
  "Every operation is audit-logged with identity, action, and IP.";

const API_TAGS = [
  {
    name: "Secrets",
    description: "Store, retrieve, update, and delete encrypted secrets. Supports bulk export.",
  },
  {
    name: "Tokens",
    description:
      "Register and manage service tokens. Each token gets a name, scoped permissions, " +
      "and usage tracking. Interactive auth only.",
  },
  { name: "Admin", description: "Authentication status and audit log access." },
  { name: "Public", description: "Unauthenticated endpoints." },
];

// Dynamic server URL + brand — adapts to deployment
app.get("/doc/json", (c) => {
  const origin = new URL(c.req.url).origin;
  const brand = c.env.BRAND_NAME || "Secret Vault";
  return c.json(
    app.getOpenAPIDocument({
      openapi: "3.0.0",
      info: { title: `${brand} API`, version: VERSION, description: API_DESCRIPTION },
      tags: API_TAGS,
      servers: [{ url: origin }],
    }),
  );
});

app.get("/doc", (c) => {
  const brand = c.env.BRAND_NAME || "Secret Vault";
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>${brand} API</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f97316'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='60' fill='white'>${brand.charAt(0)}</text></svg>" />
</head>
<body>
  <script id="api-reference" data-url="/doc/json" data-configuration='${JSON.stringify({
    theme: "kepler",
    hideDownloadButton: true,
    metaData: { title: `${brand} API` },
  })}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`);
});

// --- Auth middleware ---

app.use("*", async (c, next) => {
  const user = await authenticate(c.req.raw, c.env);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("auth", user);
  c.set("ip", c.req.header("CF-Connecting-IP") ?? null);
  c.set("ua", c.req.header("User-Agent") ?? null);
  return next();
});

// --- Mount routes ---

app.route("/", admin);
app.route("/tokens", tokens);
app.route("/secrets", bulk);
app.route("/secrets", secrets);

export default app;
