import { hasScope } from "../access.js";
import { SCOPE_READ } from "../constants.js";
import { AccessDeniedError } from "../errors.js";
import type { Recipient, ServiceContext } from "./types.js";

type UserRow = {
  email: string;
  name: string;
  role: string;
  age_public_key: string;
};
type RoleRow = { allowed_tags: string };
type PolicyRow = { scopes: string; tags: string };

export type RecipientsParams = {
  tags?: string;
};

/**
 * Resolve accessible tags for a role, checking role_policies first (policy-based RBAC),
 * then falling back to roles.allowed_tags (legacy model).
 * Returns null if unrestricted (empty tags = access to everything).
 */
async function resolveRoleTags(db: D1Database, role: string): Promise<string[] | null> {
  // Check for policy-based rules first
  const { results: policyRows } = await db
    .prepare("SELECT scopes, tags FROM role_policies WHERE role = ?")
    .bind(role)
    .all<PolicyRow>();

  if (policyRows.length > 0) {
    const allTags: string[] = [];
    for (const p of policyRows) {
      if (!p.tags) return null; // empty tags in any policy = unrestricted
      const parsed = p.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (parsed.length === 0) return null; // unrestricted
      allTags.push(...parsed);
    }
    return [...new Set(allTags)];
  }

  // Fall back to legacy single-policy from roles table
  const roleRow = await db
    .prepare("SELECT allowed_tags FROM roles WHERE name = ?")
    .bind(role)
    .first<RoleRow>();
  if (!roleRow) return []; // unknown role = no access
  if (!roleRow.allowed_tags) return null; // empty = unrestricted
  return roleRow.allowed_tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function getRecipients(
  ctx: ServiceContext,
  params?: RecipientsParams,
): Promise<{ recipients: Recipient[] }> {
  if (!hasScope(ctx.auth, SCOPE_READ)) throw new AccessDeniedError("Insufficient scope");

  const tags = params?.tags;

  // Fetch all enabled users with age public keys
  const { results: userResults } = await ctx.db
    .prepare(
      "SELECT email, name, role, age_public_key FROM users WHERE enabled = 1 AND age_public_key IS NOT NULL",
    )
    .all();

  // Also include service tokens with age public keys
  const { results: tokenResults } = await ctx.db
    .prepare(
      "SELECT client_id AS email, name, COALESCE(role, 'custom') AS role, age_public_key FROM service_tokens WHERE age_public_key IS NOT NULL",
    )
    .all();

  let eligible = [...(userResults as UserRow[]), ...(tokenResults as UserRow[])];

  // If tags specified, filter to users whose roles grant access to those tags
  if (tags) {
    const secretTags = tags.split(",").map((t) => t.trim());
    const filtered: UserRow[] = [];
    for (const user of eligible) {
      const roleTags = await resolveRoleTags(ctx.db, user.role);
      // null = unrestricted access (empty tags)
      if (roleTags === null) {
        filtered.push(user);
        continue;
      }
      // empty array from unknown role = no access
      if (roleTags.length === 0) continue;
      if (secretTags.some((t) => roleTags.includes(t))) {
        filtered.push(user);
      }
    }
    eligible = filtered;
  }

  // NOTE: No audit call - preserving existing behavior
  return {
    recipients: eligible.map((u) => ({
      email: u.email,
      name: u.name,
      age_public_key: u.age_public_key,
    })),
  };
}
