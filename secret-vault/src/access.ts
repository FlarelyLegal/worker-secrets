import { ROLE_ADMIN, SCOPE_ALL } from "./constants.js";
import type { AuthUser } from "./types.js";

// --- Scope checking ---

/** Gate check: does ANY policy grant this scope (regardless of tags)? */
export function hasScope(auth: AuthUser, required: string): boolean {
  return auth.policies.some((p) => p.scopes.includes(SCOPE_ALL) || p.scopes.includes(required));
}

// --- Admin check ---

export function isAdmin(auth: AuthUser): boolean {
  return auth.role === ROLE_ADMIN;
}

// --- Policy-based access ---

/** Resource check: does a policy grant this scope for this secret's tags? */
export function hasAccess(auth: AuthUser, requiredScope: string, secretTags: string): boolean {
  return auth.policies.some((p) => {
    const scopeOk = p.scopes.includes(SCOPE_ALL) || p.scopes.includes(requiredScope);
    if (!scopeOk) return false;
    if (p.tags.length === 0) return true; // unrestricted policy
    if (!secretTags) return false; // restricted policy, untagged secret
    const sTags = secretTags.split(",").map((t) => t.trim());
    return p.tags.some((t) => sTags.includes(t));
  });
}

/** Collect all tags the user can access for a given scope (for SQL filtering). */
export function accessibleTags(auth: AuthUser, requiredScope: string): string[] | null {
  let unrestricted = false;
  const tags: string[] = [];
  for (const p of auth.policies) {
    if (!(p.scopes.includes(SCOPE_ALL) || p.scopes.includes(requiredScope))) continue;
    if (p.tags.length === 0) {
      unrestricted = true;
      break;
    }
    tags.push(...p.tags);
  }
  return unrestricted ? null : [...new Set(tags)]; // null = all tags accessible
}

/** @deprecated Use hasAccess(auth, scope, tags) instead. */
export function hasTagAccess(auth: AuthUser, secretTags: string): boolean {
  if (auth.allowedTags.length === 0) return true;
  if (!secretTags) return false;
  const tags = secretTags.split(",").map((t) => t.trim());
  return auth.allowedTags.some((allowed) => tags.includes(allowed));
}
