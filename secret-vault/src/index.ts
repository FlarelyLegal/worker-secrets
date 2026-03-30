import { OpenAPIHono } from "@hono/zod-openapi";
import { auditRaw, authenticate } from "./auth.js";
import {
  ACTION_AUTH_FAILED,
  ACTION_WARP_REJECTED,
  AUTH_REJECTED,
  FLAG_ALLOWED_COUNTRIES,
  FLAG_AUDIT_CLEANUP_PROBABILITY,
  FLAG_AUDIT_RETENTION_DAYS,
  FLAG_MAINTENANCE,
  FLAG_PUBLIC_PAGES_ENABLED,
  FLAG_READ_ONLY,
  FLAG_REQUIRE_WARP,
} from "./constants.js";
import { getFlag, getFlagValue, loadAllFlags } from "./flags.js";
import admin from "./routes/admin.js";
import adminOps from "./routes/admin-ops.js";
import bulk from "./routes/bulk.js";
import flags from "./routes/flags.js";
import policies from "./routes/policies.js";
import pub from "./routes/public.js";
import recipientsRoute from "./routes/recipients.js";
import roles from "./routes/roles.js";
import rotateKeyRoute from "./routes/rotate-key.js";
import secretWrite from "./routes/secret-write.js";
import secrets from "./routes/secrets.js";
import tokens from "./routes/tokens.js";
import users from "./routes/users.js";
import versions from "./routes/versions.js";
import type { HonoEnv } from "./types.js";
import { VERSION } from "./version.js";
import { checkWarpRequired, extractWarpInfo } from "./warp.js";

export { isSafeWebhookUrl } from "./webhook.js";

import { fireWebhook } from "./webhook.js";

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

// --- Security headers ---

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "interest-cohort=()");
  c.res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  c.res.headers.set("X-Request-ID", requestId);
  if (c.res.headers.get("Content-Type")?.includes("text/html")) {
    c.res.headers.set("X-Frame-Options", "DENY");
    const isScalar = c.req.path === "/doc";
    c.res.headers.set(
      "Content-Security-Policy",
      isScalar
        ? "default-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data: https:; font-src https://cdn.jsdelivr.net"
        : "default-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'",
    );
  }
});

// --- CORS (optional, controlled by CORS_ORIGINS env var) ---

app.use("*", async (c, next) => {
  const origins = c.env.CORS_ORIGINS;
  if (!origins) return next();

  const origin = c.req.header("Origin");
  const allowed = origins.split(",").map((o) => o.trim());
  if (origin && (allowed.includes("*") || allowed.includes(origin))) {
    c.res.headers.set("Access-Control-Allow-Origin", allowed.includes("*") ? "*" : origin);
    c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Cf-Access-Jwt-Assertion, CF-Access-Client-Id, CF-Access-Client-Secret",
    );
    c.res.headers.set("Access-Control-Max-Age", "86400");
  }

  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: c.res.headers });
  }

  return next();
});

// --- Public (before auth middleware) ---

app.route("/", pub);

const API_DESCRIPTION =
  "Self-hosted secret management on Cloudflare Workers. " +
  "Secrets are encrypted at rest with AES-256-GCM in a D1 database. " +
  "Two auth paths via Cloudflare Access: interactive sessions (IdP, optionally with hardware keys) " +
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
      "and usage tracking. Admin only.",
  },
  { name: "Users", description: "User management with RBAC role assignment (admin only)" },
  { name: "Roles", description: "Role definitions with scoped permissions (admin only)" },
  { name: "Flags", description: "Feature flags backed by KV (plaintext, not encrypted)" },
  { name: "Admin", description: "Authentication status and audit log access." },
  { name: "Public", description: "Unauthenticated endpoints." },
];

// Dynamic server URL + brand — adapts to deployment
app.get("/doc/json", async (c) => {
  const enabled = await getFlagValue(c.env.FLAGS, FLAG_PUBLIC_PAGES_ENABLED, true);
  if (!enabled) return c.notFound();
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

app.get("/doc", async (c) => {
  const enabled = await getFlagValue(c.env.FLAGS, FLAG_PUBLIC_PAGES_ENABLED, true);
  if (!enabled) return c.notFound();
  const raw = c.env.BRAND_NAME || "Secret Vault";
  const brand = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>${brand} API | HomeFlare</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f97316'/><text x='50' y='67' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='44' fill='white'>HF</text></svg>" />
</head>
<body>
  <script id="api-reference" data-url="/doc/json" data-configuration='${JSON.stringify({
    theme: "kepler",
    hideDownloadButton: true,
    metaData: { title: `${raw} API` },
  })}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1"></script>
</body>
</html>`);
});

// --- Auth middleware ---

app.use("*", async (c, next) => {
  // Load all flags in a single KV batch — cached in context for the request
  const flagCache = await loadAllFlags(c.env.FLAGS);
  c.set("flags", flagCache);

  // Maintenance mode — checked before authentication
  if (getFlag(flagCache, FLAG_MAINTENANCE, false)) {
    return c.json({ error: "Service is in maintenance mode" }, 503);
  }

  // Geo-fencing — restrict all access by country
  const allowedCountries = (getFlag(flagCache, FLAG_ALLOWED_COUNTRIES, "") as string)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (allowedCountries.length > 0) {
    const country = (c.req.raw as unknown as { cf?: { country?: string } }).cf?.country ?? "";
    if (!allowedCountries.includes(country.toUpperCase())) {
      return c.json({ error: "Access denied — geo-restricted" }, 403);
    }
  }

  const authResult = await authenticate(c.req.raw, c.env);
  if (!authResult) {
    try {
      await auditRaw(
        c.env.DB,
        AUTH_REJECTED,
        "unknown",
        ACTION_AUTH_FAILED,
        null,
        c.req.header("CF-Connecting-IP") ?? null,
        c.req.header("User-Agent") ?? null,
        c.get("requestId"),
      );
    } catch {
      // Don't fail the 401 if audit logging fails
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { user, jwtPayload } = authResult;
  // WARP enforcement (pass JWT payload for device_sessions detection)
  const warpInfo = extractWarpInfo(c.req.raw, jwtPayload);
  // Exempt /whoami from WARP enforcement (diagnostic endpoint, browser-accessible)
  const isWhoami = new URL(c.req.url).pathname === "/whoami";
  const warpRequired = isWhoami ? false : (getFlag(flagCache, FLAG_REQUIRE_WARP, false) as boolean);
  const ztResponse = c.req.header("X-ZT-Response");
  const ztTimestamp = c.req.header("X-ZT-Timestamp");
  // Query user's registered ZT fingerprint for device binding
  let userZtFingerprint: string | undefined;
  if (user.method === "interactive") {
    const userZt = await c.env.DB.prepare("SELECT zt_fingerprint FROM users WHERE email = ?")
      .bind(user.identity.toLowerCase())
      .first<{ zt_fingerprint: string }>();
    userZtFingerprint = userZt?.zt_fingerprint || undefined;
  }
  const warpCheck = await checkWarpRequired(
    warpInfo,
    warpRequired,
    ztResponse ?? undefined,
    ztTimestamp ?? undefined,
    c.env.ZT_CA_FINGERPRINT,
    userZtFingerprint,
  );
  if (!warpCheck.allowed) {
    try {
      await auditRaw(
        c.env.DB,
        user.method === "interactive" ? "interactive" : user.name,
        user.identity,
        ACTION_WARP_REJECTED,
        null,
        c.req.header("CF-Connecting-IP") ?? null,
        c.req.header("User-Agent") ?? null,
        c.get("requestId"),
        warpInfo.connected,
      );
    } catch {
      // Don't fail the 403 if audit logging fails
    }
    return c.json({ error: warpCheck.reason }, 403);
  }
  user.warp = {
    connected: warpInfo.connected,
    ztVerified: warpCheck.allowed && warpInfo.connected,
    deviceId: warpInfo.deviceId,
  };

  c.set("auth", user);
  c.set("ip", c.req.header("CF-Connecting-IP") ?? null);
  c.set("ua", c.req.header("User-Agent") ?? null);
  await next();

  // Webhook — fire latest audit entry for this request to external URL
  fireWebhook(c.env.DB, c.get("requestId"), (p) => c.executionCtx.waitUntil(p), flagCache);

  // Background audit cleanup
  const cleanupProbability = getFlag(flagCache, FLAG_AUDIT_CLEANUP_PROBABILITY, 0.01);
  if (Math.random() < cleanupProbability) {
    const retentionDays = getFlag(flagCache, FLAG_AUDIT_RETENTION_DAYS, 90);
    c.executionCtx.waitUntil(
      c.env.DB.prepare("DELETE FROM audit_log WHERE timestamp < datetime('now', ? || ' days')")
        .bind(`-${Math.max(1, Math.floor(Number(retentionDays)))}`)
        .run(),
    );
  }
});

// --- Read-only mode (after auth so unauthenticated users still get 401) ---

app.use("*", async (c, next) => {
  if (["PUT", "POST", "DELETE"].includes(c.req.method)) {
    if (getFlag(c.get("flags"), FLAG_READ_ONLY, false)) {
      return c.json({ error: "Vault is in read-only mode" }, 503);
    }
  }
  return next();
});

// --- Mount routes ---

app.route("/", admin);
app.route("/admin", adminOps);
app.route("/admin", rotateKeyRoute);
app.route("/users", users);
app.route("/recipients", recipientsRoute);
app.route("/roles", roles);
app.route("/roles", policies);
app.route("/tokens", tokens);
app.route("/flags", flags);
app.route("/secrets", bulk);
app.route("/secrets", versions);
app.route("/secrets", secretWrite);
app.route("/secrets", secrets);

export default app;
