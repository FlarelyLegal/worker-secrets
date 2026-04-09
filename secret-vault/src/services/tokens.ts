import {
  ACTION_LIST_TOKENS,
  ACTION_REGISTER_TOKEN,
  ACTION_REVOKE_TOKEN,
} from "../constants.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { ServiceToken, ServiceContext } from "./types.js";

// --- List ---

export async function listTokens(ctx: ServiceContext): Promise<{ tokens: ServiceToken[] }> {
  const { results } = await ctx.db
    .prepare(
      "SELECT client_id, name, description, scopes, role, created_by, created_at, updated_at, last_used_at FROM service_tokens ORDER BY name",
    )
    .all();
  await ctx.auditFn(ACTION_LIST_TOKENS, null);
  return { tokens: results as ServiceToken[] };
}

// --- Register ---

export async function registerToken(
  ctx: ServiceContext,
  clientId: string,
  data: {
    name: string;
    description: string;
    scopes: string;
    role?: string | null;
    client_secret_hash?: string | null;
    age_public_key?: string | null;
  },
): Promise<{ ok: true; client_id: string; name: string; scopes: string }> {
  const { name, description, scopes, role, client_secret_hash: secretHash, age_public_key: ageKey } = data;

  // Verify role exists if provided
  if (role) {
    const roleExists = await ctx.db
      .prepare("SELECT name FROM roles WHERE name = ?")
      .bind(role)
      .first();
    if (!roleExists) throw new ValidationError(`Role '${role}' does not exist`);
  }

  const identity = ctx.auth.identity;
  await ctx.db
    .prepare(
      `INSERT INTO service_tokens (client_id, name, description, scopes, role, created_by, client_secret_hash, age_public_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(client_id) DO UPDATE SET
       name = excluded.name, description = excluded.description,
       scopes = excluded.scopes, role = excluded.role,
       client_secret_hash = COALESCE(excluded.client_secret_hash, client_secret_hash),
       age_public_key = COALESCE(excluded.age_public_key, age_public_key),
       updated_at = datetime('now')`,
    )
    .bind(
      clientId,
      name,
      description,
      scopes,
      role || null,
      identity,
      secretHash || null,
      ageKey || null,
    )
    .run();

  await ctx.auditFn(ACTION_REGISTER_TOKEN, clientId);
  return { ok: true, client_id: clientId, name, scopes };
}

// --- Revoke ---

export async function revokeToken(
  ctx: ServiceContext,
  clientId: string,
): Promise<{ ok: true; revoked: string }> {
  const result = await ctx.db
    .prepare("DELETE FROM service_tokens WHERE client_id = ?")
    .bind(clientId)
    .run();

  if (result.meta.changes === 0) throw new NotFoundError("Token not found");

  await ctx.auditFn(ACTION_REVOKE_TOKEN, clientId);
  return { ok: true, revoked: clientId };
}
