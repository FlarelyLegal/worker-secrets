import { ACTION_SET_ROLE } from "../constants.js";
import { NotFoundError } from "../errors.js";
import type { Policy, ServiceContext } from "./types.js";

// --- List ---

export async function listPolicies(
  ctx: ServiceContext,
  roleName: string,
): Promise<{ policies: Policy[] }> {
  const role = await ctx.db.prepare("SELECT name FROM roles WHERE name = ?").bind(roleName).first();
  if (!role) throw new NotFoundError("Role not found");

  const { results } = await ctx.db
    .prepare(
      "SELECT id, role, scopes, tags, description, created_by, created_at FROM role_policies WHERE role = ? ORDER BY id",
    )
    .bind(roleName)
    .all();
  return { policies: results as Policy[] };
}

// --- Set (replace all) ---

export async function setPolicies(
  ctx: ServiceContext,
  roleName: string,
  policies: Array<{ scopes: string; tags: string; description: string }>,
): Promise<{ ok: true; count: number }> {
  const role = await ctx.db.prepare("SELECT name FROM roles WHERE name = ?").bind(roleName).first();
  if (!role) throw new NotFoundError("Role not found");

  const identity = ctx.auth.identity;

  // Replace all policies atomically
  const stmts: D1PreparedStatement[] = [
    ctx.db.prepare("DELETE FROM role_policies WHERE role = ?").bind(roleName),
  ];
  for (const p of policies) {
    stmts.push(
      ctx.db
        .prepare(
          "INSERT INTO role_policies (role, scopes, tags, description, created_by) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(roleName, p.scopes, p.tags, p.description, identity),
    );
  }
  await ctx.db.batch(stmts);

  await ctx.auditFn(ACTION_SET_ROLE, roleName);
  return { ok: true, count: policies.length };
}
