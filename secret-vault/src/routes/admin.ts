import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { AuditEntrySchema, AuditQuery, ErrorSchema, WhoamiSchema } from "../schemas.js";
import type { HonoEnv } from "../types.js";
import { whoamiPage } from "../whoami-page.js";

const admin = new OpenAPIHono<HonoEnv>();

// --- /whoami ---

const whoamiRoute = createRoute({
  method: "get",
  path: "/whoami",
  tags: ["Admin"],
  summary: "Check authentication status",
  responses: {
    200: { content: { "application/json": { schema: WhoamiSchema } }, description: "Auth info" },
  },
});

admin.openapi(whoamiRoute, async (c) => {
  const auth = c.get("auth");

  // Enrich with user record details
  const user = await c.env.DB.prepare(
    "SELECT age_public_key, zt_fingerprint, enabled, last_login_at FROM users WHERE email = ?",
  )
    .bind(auth.identity.toLowerCase())
    .first<{
      age_public_key: string | null;
      zt_fingerprint: string;
      enabled: number;
      last_login_at: string | null;
    }>();

  // Count policies for this role
  const policyCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM role_policies WHERE role = ?",
  )
    .bind(auth.role)
    .first<{ total: number }>();

  // Count accessible secrets
  const secretCount = await c.env.DB.prepare("SELECT COUNT(*) as total FROM secrets").first<{
    total: number;
  }>();

  const data = {
    method: auth.method,
    identity: auth.identity,
    name: auth.name,
    role: auth.role,
    scopes: auth.scopes,
    e2e: !!user?.age_public_key,
    deviceBound: !!user?.zt_fingerprint,
    policies: policyCount?.total ?? 0,
    lastLogin: user?.last_login_at ?? null,
    totalSecrets: secretCount?.total ?? 0,
    warp: auth.warp
      ? {
          connected: auth.warp.connected,
          ztVerified: auth.warp.ztVerified,
          deviceId: auth.warp.deviceId,
        }
      : undefined,
  };

  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/html")) {
    const brand = c.env.BRAND_NAME || "Secret Vault";
    // biome-ignore lint/suspicious/noExplicitAny: content negotiation returns HTML or JSON
    return c.html(whoamiPage(brand, data)) as any;
  }
  return c.json(data, 200);
});

// --- /audit ---

const auditRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["Admin"],
  summary: "View audit log (admin only)",
  request: { query: AuditQuery },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ entries: z.array(AuditEntrySchema) }) },
      },
      description: "Audit entries",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Owner only",
    },
  },
});

admin.openapi(auditRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth))
    return c.json({ error: "Admin only" }, 403);

  const { limit, offset, identity, action, key, method, from, to } = c.req.valid("query");
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (identity) {
    conditions.push("identity = ?");
    binds.push(identity);
  }
  if (action) {
    conditions.push("action = ?");
    binds.push(action);
  }
  if (key) {
    conditions.push("secret_key = ?");
    binds.push(key);
  }
  if (method) {
    conditions.push("method = ?");
    binds.push(method);
  }
  if (from) {
    conditions.push("timestamp >= ?");
    binds.push(from);
  }
  if (to) {
    conditions.push("timestamp <= ?");
    binds.push(to);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM audit_log${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds, limit, offset)
    .all();

  return c.json({ entries: results as z.infer<typeof AuditEntrySchema>[] }, 200);
});

export default admin;
