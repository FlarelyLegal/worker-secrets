import {
  ACTION_ADD_USER,
  ACTION_DELETE_USER,
  ACTION_LIST_USERS,
  ACTION_UPDATE_USER,
  ROLE_ADMIN,
} from "../constants.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { adminCount } from "./helpers.js";
import type { ServiceContext, User } from "./types.js";

// --- List ---

export async function listUsers(ctx: ServiceContext): Promise<{ users: User[] }> {
  const { results } = await ctx.db
    .prepare(
      "SELECT email, name, role, enabled, age_public_key, last_login_at, created_by, created_at, updated_by, updated_at FROM users ORDER BY email",
    )
    .all();
  await ctx.auditFn(ACTION_LIST_USERS, null);
  return { users: results as User[] };
}

// --- Add (PUT) ---

export async function addUser(
  ctx: ServiceContext,
  email: string,
  data: { name: string; role: string },
): Promise<{ ok: true; email: string }> {
  const { name, role } = data;
  const lowerEmail = email.toLowerCase();

  // Verify role exists
  const roleExists = await ctx.db
    .prepare("SELECT name FROM roles WHERE name = ?")
    .bind(role)
    .first();
  if (!roleExists) throw new ValidationError(`Role '${role}' does not exist`);

  // Prevent demoting the last admin via upsert
  const existing = await ctx.db
    .prepare("SELECT role, enabled FROM users WHERE email = ?")
    .bind(lowerEmail)
    .first<{ role: string; enabled: number }>();
  if (existing?.role === ROLE_ADMIN && existing.enabled && role !== ROLE_ADMIN) {
    if ((await adminCount(ctx.db)) <= 1)
      throw new ValidationError("Cannot remove the last admin");
  }

  const identity = ctx.auth.identity;
  await ctx.db
    .prepare(
      `INSERT INTO users (email, name, role, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       name = excluded.name, role = excluded.role,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
    )
    .bind(lowerEmail, name, role, identity, identity)
    .run();

  await ctx.auditFn(ACTION_ADD_USER, email);
  return { ok: true, email: lowerEmail };
}

// --- Update (PATCH) ---

export async function updateUser(
  ctx: ServiceContext,
  email: string,
  body: {
    name?: string;
    role?: string;
    enabled?: boolean;
    age_public_key?: string | null;
    zt_fingerprint?: string | null;
  },
): Promise<{ ok: true; email: string }> {
  const lowerEmail = email.toLowerCase();

  const existing = await ctx.db
    .prepare("SELECT email FROM users WHERE email = ?")
    .bind(lowerEmail)
    .first();
  if (!existing) throw new NotFoundError("User not found");

  if (body.role) {
    const roleExists = await ctx.db
      .prepare("SELECT name FROM roles WHERE name = ?")
      .bind(body.role)
      .first();
    if (!roleExists) throw new ValidationError(`Role '${body.role}' does not exist`);
  }

  // Prevent removing the last admin
  const current = await ctx.db
    .prepare("SELECT role, enabled FROM users WHERE email = ?")
    .bind(lowerEmail)
    .first<{ role: string; enabled: number }>();
  if (current?.role === ROLE_ADMIN && current.enabled) {
    const wouldLoseAdmin =
      (body.role !== undefined && body.role !== ROLE_ADMIN) || body.enabled === false;
    if (wouldLoseAdmin && (await adminCount(ctx.db)) <= 1) {
      throw new ValidationError("Cannot remove the last admin");
    }
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.name !== undefined) {
    sets.push("name = ?");
    binds.push(body.name);
  }
  if (body.role !== undefined) {
    sets.push("role = ?");
    binds.push(body.role);
  }
  if (body.enabled !== undefined) {
    sets.push("enabled = ?");
    binds.push(body.enabled ? 1 : 0);
  }
  if (body.age_public_key !== undefined) {
    if (body.age_public_key && !body.age_public_key.startsWith("age1"))
      throw new ValidationError("Public key must start with age1");
    sets.push("age_public_key = ?");
    binds.push(body.age_public_key);
  }
  if (body.zt_fingerprint !== undefined) {
    sets.push("zt_fingerprint = ?");
    binds.push(body.zt_fingerprint);
  }
  if (sets.length === 0) throw new ValidationError("No fields to update");

  sets.push("updated_by = ?", "updated_at = datetime('now')");
  binds.push(ctx.auth.identity, lowerEmail);

  await ctx.db
    .prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`)
    .bind(...binds)
    .run();

  await ctx.auditFn(ACTION_UPDATE_USER, email);
  return { ok: true, email: lowerEmail };
}

// --- Remove (DELETE) ---

export async function removeUser(
  ctx: ServiceContext,
  email: string,
): Promise<{ ok: true; deleted: string }> {
  const lowerEmail = email.toLowerCase();

  // Prevent self-deletion
  if (lowerEmail === ctx.auth.identity.toLowerCase()) {
    throw new ValidationError("Cannot delete yourself");
  }

  // Prevent deleting the last admin
  const target = await ctx.db
    .prepare("SELECT role, enabled FROM users WHERE email = ?")
    .bind(lowerEmail)
    .first<{ role: string; enabled: number }>();
  if (target?.role === ROLE_ADMIN && target.enabled && (await adminCount(ctx.db)) <= 1) {
    throw new ValidationError("Cannot delete the last admin");
  }

  const result = await ctx.db
    .prepare("DELETE FROM users WHERE email = ?")
    .bind(lowerEmail)
    .run();
  if (result.meta.changes === 0) throw new NotFoundError("User not found");

  await ctx.auditFn(ACTION_DELETE_USER, email);
  return { ok: true, deleted: lowerEmail };
}
