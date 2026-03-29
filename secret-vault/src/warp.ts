/** WARP enrollment detection and ZT challenge-response verification. */

export interface WarpInfo {
  connected: boolean;
  deviceId?: string;
}

/** Extract WARP connection info from a Cloudflare Workers request. */
export function extractWarpInfo(request: Request, jwtPayload?: Record<string, unknown>): WarpInfo {
  let connected = false;
  let deviceId: string | undefined;

  // Check JWT device_sessions (populated when Access has device posture rules)
  if (jwtPayload?.device_sessions && typeof jwtPayload.device_sessions === "object") {
    const sessions = jwtPayload.device_sessions as Record<string, unknown>;
    const ids = Object.keys(sessions);
    if (ids.length > 0) {
      connected = true;
      deviceId = ids[0];
    }
  }

  // Check cf object for Gateway/WARP indicators
  if (!connected) {
    const cf = (request as unknown as { cf?: Record<string, unknown> }).cf;
    if (cf) {
      if (cf.asn === 13335) connected = true;
      if (cf.corporateProxy === true) connected = true;
      const bm = cf.botManagement as Record<string, unknown> | undefined;
      if (bm?.corporateProxy === true) connected = true;
    }
  }

  return { connected, deviceId };
}

/** Compute HMAC-SHA256 using Web Crypto API (for Workers runtime). */
export async function computeZtHmac(fingerprint: string, timestamp: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(fingerprint),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify a ZT challenge-response.
 * The client computes HMAC-SHA256(fingerprint, minute) where minute = floor(now / 60000).
 * We accept the current minute and one minute prior to tolerate clock skew.
 * Responses older than 2 minutes are rejected as stale.
 */
export async function verifyZtChallenge(
  response: string,
  timestamp: string,
  storedFingerprint: string,
): Promise<boolean> {
  const parsedMinute = Number.parseInt(timestamp, 10);
  if (Number.isNaN(parsedMinute)) return false;

  const currentMinute = Math.floor(Date.now() / 60000);
  if (currentMinute - parsedMinute > 2) return false;

  // Check the exact minute the client claimed
  const expected = await computeZtHmac(storedFingerprint, timestamp);
  if (timingSafeEqual(response.toLowerCase(), expected.toLowerCase())) return true;

  // Also try minute-1 for clock skew
  const skewTimestamp = (parsedMinute - 1).toString();
  const expectedSkew = await computeZtHmac(storedFingerprint, skewTimestamp);
  return timingSafeEqual(response.toLowerCase(), expectedSkew.toLowerCase());
}

/** Check if WARP is required and whether the request satisfies the requirement. */
export async function checkWarpRequired(
  warpInfo: WarpInfo,
  required: boolean,
  ztResponse?: string,
  ztTimestamp?: string,
  storedFingerprint?: string,
  userZtFingerprint?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!required) return { allowed: true };
  if (!warpInfo.connected) return { allowed: false, reason: "WARP enrollment required" };

  // If org fingerprint is configured, verify challenge-response
  if (storedFingerprint) {
    if (!ztResponse || !ztTimestamp) {
      return {
        allowed: false,
        reason: "WARP enrollment required — ZT challenge-response missing",
      };
    }
    const valid = await verifyZtChallenge(ztResponse, ztTimestamp, storedFingerprint);
    if (!valid) {
      return {
        allowed: false,
        reason: "WARP enrollment required — ZT challenge-response invalid",
      };
    }
  }

  // Device binding: user's registered fingerprint must match the org's ZT CA fingerprint
  if (userZtFingerprint && storedFingerprint) {
    if (userZtFingerprint !== storedFingerprint) {
      return {
        allowed: false,
        reason: "WARP enrollment required — device fingerprint mismatch",
      };
    }
  }

  return { allowed: true };
}
