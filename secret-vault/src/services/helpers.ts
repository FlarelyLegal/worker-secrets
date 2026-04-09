/**
 * Build a dynamic SQL SET clause from optional update fields.
 * Used by users PATCH and roles PATCH.
 */
export function buildUpdateSets(
  updates: Record<string, unknown>,
  updatedBy: string,
): { setClauses: string[]; binds: unknown[] } | null {
  const setClauses: string[] = [];
  const binds: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      binds.push(value);
    }
  }
  if (setClauses.length === 0) return null;
  setClauses.push("updated_by = ?", "updated_at = datetime('now')");
  binds.push(updatedBy);
  return { setClauses, binds };
}

/** Count enabled admin users. Prevents removing last admin. */
export async function adminCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND enabled = 1")
    .first<{ count: number }>();
  return row?.count ?? 0;
}
