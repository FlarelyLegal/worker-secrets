/** Pattern matching ${SECRET_KEY} references inside secret values. */
const REF_PATTERN = /\$\{([A-Za-z0-9_.-]+)\}/g;

const MAX_DEPTH = 3;

/**
 * Resolve `${SECRET_NAME}` references in a secret value.
 *
 * @param value    - The string that may contain `${KEY}` placeholders.
 * @param resolve  - Async function that fetches and returns a plaintext value for a key.
 * @param visited  - Set of keys already on the current resolution stack (guards circular refs).
 * @param depth    - Current nesting depth; throws when it exceeds MAX_DEPTH.
 * @returns The fully-interpolated string.
 */
export async function interpolate(
  value: string,
  resolve: (key: string) => Promise<string>,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<string> {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Secret reference depth exceeded ${MAX_DEPTH} levels - possible circular reference`,
    );
  }

  // Collect unique keys referenced in this value.
  const refs = new Set<string>();
  for (const match of value.matchAll(REF_PATTERN)) {
    refs.add(match[1]);
  }

  if (refs.size === 0) return value;

  // Resolve each unique reference exactly once, then substitute.
  const resolved = new Map<string, string>();
  for (const key of refs) {
    if (visited.has(key)) {
      throw new Error(`Circular secret reference detected: \${${key}} references itself`);
    }
    resolved.set(key, await resolve(key));
  }

  let result = value;
  for (const [key, replacement] of resolved) {
    result = result.replaceAll(`\${${key}}`, replacement);
  }

  // Recurse to handle references inside substituted values.
  const nextVisited = new Set([...visited, ...refs]);
  return interpolate(result, resolve, nextVisited, depth + 1);
}
