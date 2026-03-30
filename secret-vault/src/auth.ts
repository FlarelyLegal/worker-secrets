import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  AUTH_INTERACTIVE,
  AUTH_SERVICE_TOKEN,
  FLAG_ALLOWED_EMAILS_ROLE,
  FLAG_AUTO_PROVISION_ROLE,
  ROLE_ADMIN,
  ROLE_READER,
  SCOPE_ALL,
  SCOPE_READ,
} from "./constants.js";
import { getFlagValue } from "./flags.js";
import type { AuthUser, Env, PolicyRule } from "./types.js";

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
): Promise<{ scopes: string[]; allowedTags: string[]; policies: PolicyRule[] }> {
  // Check for policy-based rules first
  const { results: policyRows } = await db
    .prepare("SELECT scopes, tags FROM role_policies WHERE role = ?")
    .bind(role)
    .all<{ scopes: string; tags: string }>();

  if (policyRows.length > 0) {
    const policies: PolicyRule[] = policyRows.map((p) => ({
      scopes: p.scopes === SCOPE_ALL ? [SCOPE_ALL] : p.scopes.split(",").map((s) => s.trim()),
      tags: p.tags
        ? p.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    }));
    // Derive legacy fields from policies for backward compat
    const allScopes = [...new Set(policies.flatMap((p) => p.scopes))];
    const allTags = [...new Set(policies.flatMap((p) => p.tags))];
    return { scopes: allScopes, allowedTags: allTags, policies };
  }

  // Fall back to legacy single-policy from roles table
  const row = await db
    .prepare("SELECT scopes, allowed_tags FROM roles WHERE name = ?")
    .bind(role)
    .first<RoleRow>();
  if (!row) {
    const fallback: PolicyRule = { scopes: [SCOPE_READ], tags: [] };
    return { scopes: [SCOPE_READ], allowedTags: [], policies: [fallback] };
  }
  const scopes =
    row.scopes === SCOPE_ALL ? [SCOPE_ALL] : row.scopes.split(",").map((s) => s.trim());
  const allowedTags = row.allowed_tags
    ? row.allowed_tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const policy: PolicyRule = { scopes, tags: allowedTags };
  return { scopes, allowedTags, policies: [policy] };
}

// --- Crypto helpers ---

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// --- Auth ---

type UserRow = { email: string; name: string; role: string; enabled: number };
type TokenRow = { client_id: string; name: string; scopes: string; role: string | null };

async function resolveTokenUser(db: D1Database, registered: TokenRow): Promise<AuthUser> {
  let scopes: string[];
  let allowedTags: string[] = [];
  let policies: PolicyRule[];
  if (registered.role) {
    const resolved = await resolveRole(db, registered.role);
    scopes = resolved.scopes;
    allowedTags = resolved.allowedTags;
    policies = resolved.policies;
  } else {
    scopes =
      registered.scopes === SCOPE_ALL
        ? [SCOPE_ALL]
        : registered.scopes.split(",").map((s) => s.trim());
    policies = [{ scopes, tags: allowedTags }];
  }
  return {
    method: AUTH_SERVICE_TOKEN,
    identity: registered.client_id,
    name: registered.name,
    role: registered.role || "custom",
    scopes,
    allowedTags,
    policies,
  };
}

async function authenticateWithJwt(
  _request: Request,
  env: Env,
  clientId: string,
  payload?: Record<string, unknown>,
): Promise<{ user: AuthUser; jwtPayload?: Record<string, unknown> } | null> {
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

  return { user: await resolveTokenUser(env.DB, registered), jwtPayload: payload };
}

export async function authenticate(
  request: Request,
  env: Env,
): Promise<{ user: AuthUser; jwtPayload?: Record<string, unknown> } | null> {
  // Dev-only bypass for local testing (wrangler dev).
  // Safety: only activates when CF-Connecting-IP is absent (no real Cloudflare edge)
  // AND the request comes from localhost. This cannot trigger in production.
  if (env.DEV_AUTH_BYPASS === "true" && !request.headers.get("CF-Connecting-IP")) {
    const url = new URL(request.url);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocal) {
      return {
        user: {
          method: AUTH_INTERACTIVE,
          identity: env.ALLOWED_EMAILS?.split(",")[0]?.trim() || "dev@local",
          name: "dev",
          role: ROLE_ADMIN,
          scopes: [SCOPE_ALL],
          allowedTags: [],
          policies: [{ scopes: [SCOPE_ALL], tags: [] }],
        },
      };
    }
  }

  // Path 1: Direct service token validation (no JWT required)
  // Allows service tokens to authenticate on any path, not just Access-protected ones.
  const clientId = request.headers.get("CF-Access-Client-Id");
  const clientSecret = request.headers.get("CF-Access-Client-Secret");
  if (clientId && clientSecret) {
    type TokenWithHash = TokenRow & { client_secret_hash: string | null };
    const registered = await env.DB.prepare(
      "SELECT client_id, name, scopes, role, client_secret_hash FROM service_tokens WHERE client_id = ?",
    )
      .bind(clientId)
      .first<TokenWithHash>();

    if (!registered) return null;

    // Validate secret: compare SHA-256 hash of provided secret against stored hash
    if (!registered.client_secret_hash) {
      // No hash stored - direct auth not available for this token.
      // Must authenticate via Access JWT instead (Path 2).
      return null;
    }
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(clientSecret));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (!timingSafeEqual(hex, registered.client_secret_hash)) return null;

    await env.DB.prepare(
      "UPDATE service_tokens SET last_used_at = datetime('now') WHERE client_id = ?",
    )
      .bind(clientId)
      .run();

    return { user: await resolveTokenUser(env.DB, registered), jwtPayload: undefined };
  }

  // Path 2: JWT-based auth (interactive sessions + legacy service tokens without stored hash)
  let token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/CF_Authorization=([^\s;]+)/);
    if (match) token = match[1];
  }
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

  // Check if this JWT is from a service token (header or JWT common_name).
  // Only trust common_name when the JWT type is "app" (Cloudflare Access service token JWT),
  // not from interactive IdP sessions where common_name could be attacker-controlled.
  const jwtClientId =
    request.headers.get("CF-Access-Client-Id") ||
    (payload.type === "app" && payload.common_name ? (payload.common_name as string) : undefined);
  if (jwtClientId) {
    return await authenticateWithJwt(request, env, jwtClientId, payload);
  }

  // Path 3: Interactive session
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

    const resolved = await resolveRole(env.DB, user.role);
    return {
      user: {
        method: AUTH_INTERACTIVE,
        identity: email,
        name: user.name || email.split("@")[0],
        role: user.role,
        ...resolved,
      },
      jwtPayload: payload,
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
        user: {
          method: AUTH_INTERACTIVE,
          identity: email,
          name: email.split("@")[0],
          role: ROLE_ADMIN,
          scopes: [SCOPE_ALL],
          allowedTags: [],
          policies: [{ scopes: [SCOPE_ALL], tags: [] }],
        },
        jwtPayload: payload,
      };
    }
    // Lost the race - fall through to re-query the users table
    const retryUser = await env.DB.prepare(
      "SELECT email, name, role, enabled FROM users WHERE email = ?",
    )
      .bind(email.toLowerCase())
      .first<UserRow>();
    if (retryUser?.enabled) {
      const resolved = await resolveRole(env.DB, retryUser.role);
      return {
        user: {
          method: AUTH_INTERACTIVE,
          identity: email,
          name: retryUser.name || email.split("@")[0],
          role: retryUser.role,
          ...resolved,
        },
        jwtPayload: payload,
      };
    }
  }

  // Auto-provision: if flag is set, create user with that role on first login.
  // Trusts Cloudflare Access to control who can reach the vault.
  const autoRole = await getFlagValue(env.FLAGS, FLAG_AUTO_PROVISION_ROLE, "");
  if (autoRole) {
    const roleExists = await env.DB.prepare("SELECT name FROM roles WHERE name = ?")
      .bind(autoRole)
      .first();
    if (roleExists) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO users (email, name, role, created_by) VALUES (?, ?, ?, 'auto-provision')",
      )
        .bind(email.toLowerCase(), email.split("@")[0], autoRole)
        .run();
      const resolved = await resolveRole(env.DB, autoRole);
      return {
        user: {
          method: AUTH_INTERACTIVE,
          identity: email,
          name: email.split("@")[0],
          role: autoRole,
          ...resolved,
        },
        jwtPayload: payload,
      };
    }
  }

  // Fallback: ALLOWED_EMAILS env var (migration path)
  if (env.ALLOWED_EMAILS) {
    const allowed = env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase());
    if (allowed.includes(email.toLowerCase())) {
      const fallbackRole = await getFlagValue(env.FLAGS, FLAG_ALLOWED_EMAILS_ROLE, ROLE_READER);
      const resolved = await resolveRole(env.DB, fallbackRole);
      return {
        user: {
          method: AUTH_INTERACTIVE,
          identity: email,
          name: email.split("@")[0],
          role: fallbackRole,
          ...resolved,
        },
        jwtPayload: payload,
      };
    }
  }

  return null;
}

// Re-export access functions so existing imports from auth.js still work
export { accessibleTags, hasAccess, hasScope, hasTagAccess, isAdmin } from "./access.js";

// Re-export audit functions from dedicated module
export { audit, auditRaw } from "./audit.js";
