import {
  ACTION_DELETE_ROLE,
  ACTION_LIST_ROLES,
  ACTION_SET_ROLE,
  ACTION_UPDATE_ROLE,
  ROLE_ADMIN,
} from "../constants.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { buildUpdateSets } from "./helpers.js";
import type { Role, ServiceContext } from "./types.js";

// --- List ---

export async function listRoles(ctx: ServiceContext): Promise<{ roles: Role[] }> {
  const { results } = await ctx.db
    .prepare(
      "SELECT name, scopes, allowed_tags, description, created_by, created_at, updated_by, updated_at FROM roles ORDER BY name",
    )
    .all();
  await ctx.auditFn(ACTION_LIST_ROLES, null);
  return { roles: results as Role[] };
}

// --- Set (PUT) ---

export async function setRole(
  ctx: ServiceContext,
  name: string,
  data: { scopes: string; allowed_tags: string; description: string },
): Promise<{ ok: true; name: string }> {
  const { scopes, allowed_tags, description } = data;
  const identity = ctx.auth.identity;

  await ctx.db
    .prepare(
      `INSERT INTO roles (name, scopes, allowed_tags, description, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       scopes = excluded.scopes, allowed_tags = excluded.allowed_tags,
       description = excluded.description,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
    )
    .bind(name, scopes, allowed_tags, description, identity, identity)
    .run();

  await ctx.auditFn(ACTION_SET_ROLE, name);
  return { ok: true, name };
}

// --- Update (PATCH) ---

export async function updateRole(
  ctx: ServiceContext,
  name: string,
  data: { scopes?: string; allowed_tags?: string; description?: string },
): Promise<{ ok: true; name: string }> {
  const existing = await ctx.db.prepare("SELECT name FROM roles WHERE name = ?").bind(name).first();
  if (!existing) throw new NotFoundError("Role not found");

  const result = buildUpdateSets(data, ctx.auth.identity);
  if (!result) throw new ValidationError("No fields to update");

  const { setClauses, binds } = result;
  binds.push(name);

  await ctx.db
    .prepare(`UPDATE roles SET ${setClauses.join(", ")} WHERE name = ?`)
    .bind(...binds)
    .run();

  await ctx.auditFn(ACTION_UPDATE_ROLE, name);
  return { ok: true, name };
}

// --- Delete ---

export async function deleteRole(
  ctx: ServiceContext,
  name: string,
): Promise<{ ok: true; deleted: string }> {
  // Protect built-in admin role
  if (name === ROLE_ADMIN) throw new ValidationError("Cannot delete the built-in admin role");

  // Prevent deleting roles that have users assigned
  const usersWithRole = await ctx.db
    .prepare("SELECT COUNT(*) as total FROM users WHERE role = ?")
    .bind(name)
    .first<{ total: number }>();
  if (usersWithRole && usersWithRole.total > 0) {
    throw new ValidationError(
      `Cannot delete role '${name}' - ${usersWithRole.total} user(s) assigned`,
    );
  }

  // Also check service tokens
  const tokensWithRole = await ctx.db
    .prepare("SELECT COUNT(*) as total FROM service_tokens WHERE role = ?")
    .bind(name)
    .first<{ total: number }>();
  if (tokensWithRole && tokensWithRole.total > 0) {
    throw new ValidationError(
      `Cannot delete role '${name}' - ${tokensWithRole.total} token(s) assigned`,
    );
  }

  const result = await ctx.db.prepare("DELETE FROM roles WHERE name = ?").bind(name).run();
  if (result.meta.changes === 0) throw new NotFoundError("Role not found");

  await ctx.auditFn(ACTION_DELETE_ROLE, name);
  return { ok: true, deleted: name };
}
