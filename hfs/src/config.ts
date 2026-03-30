import Conf from "conf";

export interface HfsConfig {
  url?: string;
  jwt?: string;
  jwtExpiry?: number; // unix timestamp
  e2eIdentity?: string; // path to age identity file
  caCert?: string; // path to custom CA certificate (e.g. WARP)
}

const config = new Conf<HfsConfig>({
  projectName: "hfs",
  schema: {
    url: { type: "string" },
    jwt: { type: "string" },
    jwtExpiry: { type: "number" },
    e2eIdentity: { type: "string" },
    caCert: { type: "string" },
  },
});

export type AuthMode =
  | { type: "jwt"; url: string; jwt: string }
  | { type: "service_token"; url: string; clientId: string; clientSecret: string };

/**
 * Resolve auth. NO FALLBACK between modes.
 *
 * - If service token env vars are set → service token mode. Period.
 *   (This is the CI/CD / Worker / programmatic path.)
 *
 * - Otherwise → interactive JWT mode.
 *   JWT must exist and not be expired. If expired, error - run `hfs login`.
 *
 * These two paths never mix. A human uses `hfs login`.
 * A machine uses registered service token env vars.
 */
export function resolveAuth(): AuthMode {
  const url = process.env.HFS_URL || config.get("url");
  if (!url) {
    throw new Error("Vault URL not configured. Run `hfs config set --url <url>` or set HFS_URL.");
  }

  // Service token path: env vars only (never stored in config file)
  const envClientId = process.env.HFS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_ID;
  const envClientSecret = process.env.HFS_CLIENT_SECRET || process.env.CF_ACCESS_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    return { type: "service_token", url, clientId: envClientId, clientSecret: envClientSecret };
  }

  // Partial service token env vars = config error, not a silent skip
  if (envClientId || envClientSecret) {
    throw new Error(
      "Incomplete service token config. Both HFS_CLIENT_ID and HFS_CLIENT_SECRET are required.",
    );
  }

  // Interactive path: JWT from `hfs login`
  const jwt = config.get("jwt");
  const jwtExpiry = config.get("jwtExpiry");

  if (!jwt) {
    throw new Error("Not authenticated. Run `hfs login` to authenticate.");
  }

  if (jwtExpiry && Date.now() / 1000 >= jwtExpiry) {
    throw new Error(
      `Session expired at ${new Date(jwtExpiry * 1000).toLocaleString()}. Run \`hfs login\` to re-authenticate.`,
    );
  }

  return { type: "jwt", url, jwt };
}

/** Store JWT and return parsed expiry (if present). */
export function storeJwt(jwt: string): { exp?: number } {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  let exp: number | undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    exp = payload.exp as number | undefined;
  } catch {
    throw new Error("Invalid JWT payload - could not decode token");
  }

  config.set("jwt", jwt);
  if (exp) {
    config.set("jwtExpiry", exp);
  }
  return { exp };
}

export function clearJwt(): void {
  config.delete("jwt");
  config.delete("jwtExpiry");
}

export function setConfig(key: keyof HfsConfig, value: string | number): void {
  config.set(key, value);
}

export function getConfig(): HfsConfig {
  const store = config.store;
  // Allow HFS_E2E_IDENTITY env var to override config (useful in CI)
  if (process.env.HFS_E2E_IDENTITY && !store.e2eIdentity) {
    store.e2eIdentity = process.env.HFS_E2E_IDENTITY;
  }
  return store;
}

export function getConfigPath(): string {
  return config.path;
}

export function clearConfig(): void {
  config.clear();
}
