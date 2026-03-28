import { createRemoteJWKSet, jwtVerify } from "jose";
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

// --- Auth ---

export async function authenticate(request: Request, env: Env): Promise<AuthUser | null> {
  // Dev-only bypass for local testing (wrangler dev).
  // Only activates when BOTH conditions are true:
  //   1. DEV_AUTH_BYPASS=true in .dev.vars
  //   2. Request is from localhost (not routed through Cloudflare)
  // Production requests always have CF-Connecting-IP set by Cloudflare's edge.
  if (env.DEV_AUTH_BYPASS === "true" && !request.headers.get("CF-Connecting-IP")) {
    return {
      method: "interactive",
      identity: env.ALLOWED_EMAILS?.split(",")[0]?.trim() || "dev@local",
      name: "owner",
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
      "SELECT client_id, name, scopes FROM service_tokens WHERE client_id = ?",
    )
      .bind(clientId)
      .first<{ client_id: string; name: string; scopes: string }>();

    if (!registered) return null;

    await env.DB.prepare(
      "UPDATE service_tokens SET last_used_at = datetime('now') WHERE client_id = ?",
    )
      .bind(clientId)
      .run();

    const scopes =
      registered.scopes === "*" ? ["*"] : registered.scopes.split(",").map((s) => s.trim());

    return {
      method: "service_token",
      identity: registered.client_id,
      name: registered.name,
      scopes,
    };
  }

  // Path 2: Interactive session
  const email = payload.email as string | undefined;
  const allowed = env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  if (email && allowed.includes(email.toLowerCase())) {
    return {
      method: "interactive",
      identity: email,
      name: "owner",
      scopes: ["*"],
    };
  }

  return null;
}

// --- Scope checking ---

export function hasScope(auth: AuthUser, required: string): boolean {
  return auth.scopes.includes("*") || auth.scopes.includes(required);
}

// --- Audit logging ---

const AUDIT_RETENTION_DAYS = 90;

export async function audit(
  env: Env,
  auth: AuthUser,
  action: string,
  secretKey: string | null,
  ip: string | null,
  userAgent: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_log (method, identity, action, secret_key, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      auth.method === "interactive" ? "interactive" : auth.name,
      auth.identity,
      action,
      secretKey,
      ip,
      userAgent,
    )
    .run();

  // Probabilistic cleanup: ~1% of requests prune entries older than retention period
  if (Math.random() < 0.01) {
    await env.DB.prepare(
      `DELETE FROM audit_log WHERE timestamp < datetime('now', '-${AUDIT_RETENTION_DAYS} days')`,
    ).run();
  }
}
