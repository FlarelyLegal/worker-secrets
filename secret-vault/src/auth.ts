import { createRemoteJWKSet, jwtVerify } from "jose";
import { getFlagValue } from "./flags.js";
import type { AuthUser, Env } from "./types.js";

// --- JWKS cache ---

let _cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let _cachedDomain = "";

function getJWKS(teamDomain: string) {
  if (_cachedJWKS && _cachedDomain === teamDomain) return _cachedJWKS;
  _cachedJWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  _cachedDomain = teamDomain;
  return _cachedJWKS;
}

// --- Scope resolution ---

type RoleRow = { name: string; scopes: string };

async function resolveScopes(db: D1Database, role: string): Promise<string[]> {
  const row = await db
    .prepare("SELECT scopes FROM roles WHERE name = ?")
    .bind(role)
    .first<RoleRow>();
  if (!row) return ["read"];
  return row.scopes === "*" ? ["*"] : row.scopes.split(",").map((s) => s.trim());
}

// --- Auth ---

type UserRow = { email: string; name: string; role: string; enabled: number };
type TokenRow = { client_id: string; name: string; scopes: string; role: string | null };

export async function authenticate(request: Request, env: Env): Promise<AuthUser | null> {
  // Dev-only bypass for local testing (wrangler dev).
  if (env.DEV_AUTH_BYPASS === "true" && !request.headers.get("CF-Connecting-IP")) {
    return {
      method: "interactive",
      identity: env.ALLOWED_EMAILS?.split(",")[0]?.trim() || "dev@local",
      name: "dev",
      role: "admin",
      scopes: ["*"],
    };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  let payload: Record<string, unknown>;
  try {
    const JWKS = getJWKS(env.TEAM_DOMAIN);
    const result = await jwtVerify(token, JWKS, {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    return null;
  }

  // Path 1: Service token
  const clientId = request.headers.get("CF-Access-Client-Id");
  if (clientId) {
    const registered = await env.DB.prepare(
      "SELECT client_id, name, scopes, role FROM service_tokens WHERE client_id = ?",
    )
      .bind(clientId)
      .first<TokenRow>();

    if (!registered) return null;

    await env.DB.prepare(
      "UPDATE service_tokens SET last_used_at = datetime('now') WHERE client_id = ?",
    )
      .bind(clientId)
      .run();

    // Role overrides raw scopes when set
    const scopes = registered.role
      ? await resolveScopes(env.DB, registered.role)
      : registered.scopes === "*"
        ? ["*"]
        : registered.scopes.split(",").map((s) => s.trim());

    return {
      method: "service_token",
      identity: registered.client_id,
      name: registered.name,
      role: registered.role || "custom",
      scopes,
    };
  }

  // Path 2: Interactive session
  const email = payload.email as string | undefined;
  if (!email) return null;

  // Check users table first
  const user = await env.DB.prepare("SELECT email, name, role, enabled FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<UserRow>();

  if (user) {
    if (!user.enabled) return null;

    // Update last login (best-effort)
    await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE email = ?")
      .bind(email.toLowerCase())
      .run();

    const scopes = await resolveScopes(env.DB, user.role);
    return {
      method: "interactive",
      identity: email,
      name: user.name || email.split("@")[0],
      role: user.role,
      scopes,
    };
  }

  // Auto-seed: if users table is empty, first interactive user becomes admin
  const count = await env.DB.prepare("SELECT COUNT(*) as total FROM users").first<{
    total: number;
  }>();
  if (count && count.total === 0) {
    await env.DB.prepare(
      "INSERT INTO users (email, name, role, created_by) VALUES (?, ?, 'admin', 'auto-seed')",
    )
      .bind(email.toLowerCase(), email.split("@")[0])
      .run();
    return {
      method: "interactive",
      identity: email,
      name: email.split("@")[0],
      role: "admin",
      scopes: ["*"],
    };
  }

  // Fallback: ALLOWED_EMAILS env var (migration path for existing deployments)
  // Default role controlled by allowed_emails_role flag (default: reader)
  if (env.ALLOWED_EMAILS) {
    const allowed = env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase());
    if (allowed.includes(email.toLowerCase())) {
      const fallbackRole = await getFlagValue(env.FLAGS, "allowed_emails_role", "reader");
      const scopes = await resolveScopes(env.DB, fallbackRole);
      return {
        method: "interactive",
        identity: email,
        name: email.split("@")[0],
        role: fallbackRole,
        scopes,
      };
    }
  }

  return null;
}

// --- Scope checking ---

export function hasScope(auth: AuthUser, required: string): boolean {
  return auth.scopes.includes("*") || auth.scopes.includes(required);
}

// --- Admin check ---

export function isAdmin(auth: AuthUser): boolean {
  return auth.role === "admin";
}

// --- Audit logging ---

export async function audit(
  env: Env,
  auth: AuthUser,
  action: string,
  secretKey: string | null,
  ip: string | null,
  userAgent: string | null = null,
  requestId: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_log (method, identity, action, secret_key, ip, user_agent, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      auth.method === "interactive" ? "interactive" : auth.name,
      auth.identity,
      action,
      secretKey,
      ip,
      userAgent,
      requestId,
    )
    .run();
}
