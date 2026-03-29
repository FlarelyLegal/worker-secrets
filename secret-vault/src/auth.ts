import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  AUTH_INTERACTIVE,
  AUTH_SERVICE_TOKEN,
  FLAG_ALLOWED_EMAILS_ROLE,
  ROLE_ADMIN,
  ROLE_READER,
  SCOPE_ALL,
  SCOPE_READ,
} from "./constants.js";
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

type RoleRow = { name: string; scopes: string; allowed_tags: string };

async function resolveRole(
  db: D1Database,
  role: string,
): Promise<{ scopes: string[]; allowedTags: string[] }> {
  const row = await db
    .prepare("SELECT scopes, allowed_tags FROM roles WHERE name = ?")
    .bind(role)
    .first<RoleRow>();
  if (!row) return { scopes: [SCOPE_READ], allowedTags: [] };
  const scopes =
    row.scopes === SCOPE_ALL ? [SCOPE_ALL] : row.scopes.split(",").map((s) => s.trim());
  const allowedTags = row.allowed_tags
    ? row.allowed_tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  return { scopes, allowedTags };
}

// --- Auth ---

type UserRow = { email: string; name: string; role: string; enabled: number };
type TokenRow = { client_id: string; name: string; scopes: string; role: string | null };

export async function authenticate(request: Request, env: Env): Promise<AuthUser | null> {
  // Dev-only bypass for local testing (wrangler dev).
  // Safety: only activates when CF-Connecting-IP is absent (no real Cloudflare edge)
  // AND the request comes from localhost. This cannot trigger in production.
  if (env.DEV_AUTH_BYPASS === "true" && !request.headers.get("CF-Connecting-IP")) {
    const url = new URL(request.url);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocal) {
      return {
        method: AUTH_INTERACTIVE,
        identity: env.ALLOWED_EMAILS?.split(",")[0]?.trim() || "dev@local",
        name: "dev",
        role: ROLE_ADMIN,
        scopes: [SCOPE_ALL],
        allowedTags: [],
      };
    }
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

    let scopes: string[];
    let allowedTags: string[] = [];
    if (registered.role) {
      const resolved = await resolveRole(env.DB, registered.role);
      scopes = resolved.scopes;
      allowedTags = resolved.allowedTags;
    } else {
      scopes =
        registered.scopes === SCOPE_ALL
          ? [SCOPE_ALL]
          : registered.scopes.split(",").map((s) => s.trim());
    }

    return {
      method: AUTH_SERVICE_TOKEN,
      identity: registered.client_id,
      name: registered.name,
      role: registered.role || "custom",
      scopes,
      allowedTags,
    };
  }

  // Path 2: Interactive session
  const email = payload.email as string | undefined;
  if (!email) return null;

  const user = await env.DB.prepare("SELECT email, name, role, enabled FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<UserRow>();

  if (user) {
    if (!user.enabled) return null;

    await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE email = ?")
      .bind(email.toLowerCase())
      .run();

    const { scopes, allowedTags } = await resolveRole(env.DB, user.role);
    return {
      method: AUTH_INTERACTIVE,
      identity: email,
      name: user.name || email.split("@")[0],
      role: user.role,
      scopes,
      allowedTags,
    };
  }

  // Auto-seed: if users table is empty, first interactive user becomes admin.
  // Uses INSERT OR IGNORE to prevent race condition if two requests arrive simultaneously.
  const count = await env.DB.prepare("SELECT COUNT(*) as total FROM users").first<{
    total: number;
  }>();
  if (count && count.total === 0) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO users (email, name, role, created_by) VALUES (?, ?, '${ROLE_ADMIN}', 'auto-seed')`,
    )
      .bind(email.toLowerCase(), email.split("@")[0])
      .run();

    // If we won the race, return admin. Otherwise, re-check if we were inserted by the winner.
    if (result.meta.changes > 0) {
      return {
        method: AUTH_INTERACTIVE,
        identity: email,
        name: email.split("@")[0],
        role: ROLE_ADMIN,
        scopes: [SCOPE_ALL],
        allowedTags: [],
      };
    }
    // Lost the race — fall through to re-query the users table
    const retryUser = await env.DB.prepare(
      "SELECT email, name, role, enabled FROM users WHERE email = ?",
    )
      .bind(email.toLowerCase())
      .first<UserRow>();
    if (retryUser?.enabled) {
      const { scopes, allowedTags } = await resolveRole(env.DB, retryUser.role);
      return {
        method: AUTH_INTERACTIVE,
        identity: email,
        name: retryUser.name || email.split("@")[0],
        role: retryUser.role,
        scopes,
        allowedTags,
      };
    }
  }

  // Fallback: ALLOWED_EMAILS env var (migration path)
  if (env.ALLOWED_EMAILS) {
    const allowed = env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase());
    if (allowed.includes(email.toLowerCase())) {
      const fallbackRole = await getFlagValue(env.FLAGS, FLAG_ALLOWED_EMAILS_ROLE, ROLE_READER);
      const { scopes, allowedTags } = await resolveRole(env.DB, fallbackRole);
      return {
        method: AUTH_INTERACTIVE,
        identity: email,
        name: email.split("@")[0],
        role: fallbackRole,
        scopes,
        allowedTags,
      };
    }
  }

  return null;
}

// --- Scope checking ---

export function hasScope(auth: AuthUser, required: string): boolean {
  return auth.scopes.includes(SCOPE_ALL) || auth.scopes.includes(required);
}

// --- Admin check ---

export function isAdmin(auth: AuthUser): boolean {
  return auth.role === ROLE_ADMIN;
}

// --- Tag-based access ---

export function hasTagAccess(auth: AuthUser, secretTags: string): boolean {
  if (auth.allowedTags.length === 0) return true; // no restriction
  if (!secretTags) return false; // restricted role, untagged secret
  const tags = secretTags.split(",").map((t) => t.trim());
  return auth.allowedTags.some((allowed) => tags.includes(allowed));
}

// --- Audit logging ---

async function computeChainHash(
  db: D1Database,
  method: string,
  identity: string,
  action: string,
  secretKey: string | null,
): Promise<string> {
  const prev = await db
    .prepare("SELECT id, prev_hash FROM audit_log ORDER BY id DESC LIMIT 1")
    .first<{ id: number; prev_hash: string | null }>();
  const chainInput = `${prev?.id ?? 0}|${prev?.prev_hash ?? "genesis"}|${method}|${identity}|${action}|${secretKey ?? ""}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chainInput));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function audit(
  env: Env,
  auth: AuthUser,
  action: string,
  secretKey: string | null,
  ip: string | null,
  userAgent: string | null = null,
  requestId: string | null = null,
): Promise<void> {
  const method = auth.method === AUTH_INTERACTIVE ? AUTH_INTERACTIVE : auth.name;
  const prevHash = await computeChainHash(env.DB, method, auth.identity, action, secretKey);
  await env.DB.prepare(
    "INSERT INTO audit_log (method, identity, action, secret_key, ip, user_agent, request_id, prev_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(method, auth.identity, action, secretKey, ip, userAgent, requestId, prevHash)
    .run();
}

/** Audit logging for failed auth — no AuthUser available, uses raw method/identity strings. */
export async function auditRaw(
  db: D1Database,
  method: string,
  identity: string,
  action: string,
  secretKey: string | null,
  ip: string | null,
  userAgent: string | null,
  requestId: string | null,
): Promise<void> {
  const prevHash = await computeChainHash(db, method, identity, action, secretKey);
  await db
    .prepare(
      "INSERT INTO audit_log (method, identity, action, secret_key, ip, user_agent, request_id, prev_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(method, identity, action, secretKey, ip, userAgent, requestId, prevHash)
    .run();
}
