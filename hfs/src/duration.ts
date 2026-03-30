import chalk from "chalk";

const MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

const DAY = 24 * 60 * 60 * 1000;

/** Parse a duration string like "7d", "12h", "30m" into milliseconds. */
export function parseDurationMs(dur: string): number {
  const match = /^(\d+)([smhdw])$/.exec(dur.trim());
  if (!match) throw new Error(`Invalid duration "${dur}". Use e.g. 30d, 12h, 90m, 2w`);
  return parseInt(match[1], 10) * MULTIPLIERS[match[2]];
}

/** Parse a TTL string into an ISO expiry date string relative to now. */
export function parseTtl(ttl: string): string {
  return new Date(Date.now() + parseDurationMs(ttl)).toISOString();
}

/** Format milliseconds into a short human-readable string like "23d", "4h", "12m". */
export function formatRelative(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= DAY) return `${Math.floor(abs / DAY)}d`;
  if (abs >= 60 * 60 * 1000) return `${Math.floor(abs / (60 * 60 * 1000))}h`;
  if (abs >= 60 * 1000) return `${Math.floor(abs / (60 * 1000))}m`;
  return `${Math.floor(abs / 1000)}s`;
}

/** Return a colored expiry label and its plain-text equivalent for column width calc. */
export function expiryLabel(expiresAt: string): { plain: string; colored: string } {
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return { plain: "EXPIRED", colored: chalk.red("EXPIRED") };
  const rel = `${formatRelative(msLeft)} left`;
  if (msLeft <= 14 * DAY) return { plain: rel, colored: chalk.yellow(rel) };
  return { plain: rel, colored: chalk.green(rel) };
}
