import { FLAG_WEBHOOK_FILTER, FLAG_WEBHOOK_URL } from "./constants.js";
import { getFlag } from "./flags.js";

/** Reject webhook URLs pointing to private/reserved IP ranges or localhost. */
export function isSafeWebhookUrl(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return false;
    if (!h.includes(".") && !h.includes(":")) return false; // bare hostnames
    // Block private IPv4 ranges
    const parts = h.split(".").map(Number);
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
      if (parts[0] === 10) return false;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 169 && parts[1] === 254) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Fire webhook with latest audit entry for this request (if configured). */
export function fireWebhook(
  db: D1Database,
  requestId: string,
  waitUntil: (promise: Promise<unknown>) => void,
  flagCache: Map<string, unknown>,
): void {
  const webhookUrl = getFlag(flagCache, FLAG_WEBHOOK_URL, "") as string;
  if (!webhookUrl?.startsWith("https://") || !isSafeWebhookUrl(webhookUrl)) return;

  const filter = (getFlag(flagCache, FLAG_WEBHOOK_FILTER, "") as string)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  waitUntil(
    db
      .prepare("SELECT * FROM audit_log WHERE request_id = ? ORDER BY id DESC LIMIT 1")
      .bind(requestId)
      .first()
      .then((entry: Record<string, unknown> | null) => {
        if (!entry) return;
        if (filter.length > 0 && !filter.includes(entry.action as string)) return;
        return fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
          signal: AbortSignal.timeout(5000),
        });
      })
      .catch(() => {}),
  );
}
