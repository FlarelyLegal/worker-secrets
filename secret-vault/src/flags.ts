/**
 * Feature flag helper.
 *
 * Flags are stored in the FLAGS KV namespace as JSON:
 *   { value, type, description, updated_by, updated_at }
 *
 * `getFlagValue` reads the `value` field with a type-safe fallback.
 */
export async function getFlagValue<T>(kv: KVNamespace, key: string, defaultValue: T): Promise<T> {
  const raw = await kv.get(key);
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw).value as T;
  } catch {
    return defaultValue;
  }
}
