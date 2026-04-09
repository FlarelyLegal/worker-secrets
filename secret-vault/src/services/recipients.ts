import { SCOPE_READ } from "../constants.js";
import { AccessDeniedError } from "../errors.js";
import { hasScope } from "../access.js";
import type { Recipient, ServiceContext } from "./types.js";

type UserRow = {
  email: string;
  name: string;
  role: string;
  age_public_key: string;
};
type RoleRow = { allowed_tags: string };

export type RecipientsParams = {
  tags?: string;
};

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
      const role = await ctx.db
        .prepare("SELECT allowed_tags FROM roles WHERE name = ?")
        .bind(user.role)
        .first<RoleRow>();
      if (!role) continue;
      // Empty allowed_tags = access to everything
      if (!role.allowed_tags) {
        filtered.push(user);
        continue;
      }
      const roleTags = role.allowed_tags.split(",").map((t) => t.trim());
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
