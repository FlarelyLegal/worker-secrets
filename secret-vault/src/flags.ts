/**
 * Feature flag system.
 *
 * Flags are stored in the FLAGS KV namespace as JSON:
 *   { value, type, description, updated_by, updated_at }
 *
 * `loadAllFlags` reads all flags in a single KV list+get batch.
 * `getFlag` reads from the pre-loaded cache (no KV round-trip).
 * `getFlagValue` is the legacy per-key reader (still used in auth.ts
 * which runs before flags are loaded into context).
 */

export type FlagCache = Map<string, unknown>;

export async function loadAllFlags(kv: KVNamespace): Promise<FlagCache> {
  const cache: FlagCache = new Map();
  const list = await kv.list();
  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await kv.get(k.name);
      if (!raw) return null;
      try {
        return { key: k.name, value: JSON.parse(raw).value };
      } catch {
        return { key: k.name, value: raw };
      }
    }),
  );
  for (const entry of entries) {
    if (entry) cache.set(entry.key, entry.value);
  }
  return cache;
}

export function getFlag<T>(cache: FlagCache, key: string, defaultValue: T): T {
  if (!cache.has(key)) return defaultValue;
  return cache.get(key) as T;
}

/** Legacy per-key reader — used in auth.ts before flags are in context */
export async function getFlagValue<T>(kv: KVNamespace, key: string, defaultValue: T): Promise<T> {
  const raw = await kv.get(key);
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw).value as T;
  } catch {
    return defaultValue;
  }
}
