import { describe, expect, it } from "vitest";
import { checkWarpRequired, computeZtHmac, extractWarpInfo, verifyZtChallenge } from "../warp.js";

// ---------------------------------------------------------------------------
// extractWarpInfo
// ---------------------------------------------------------------------------
describe("extractWarpInfo", () => {
  it("returns connected:false for plain request", () => {
    const req = new Request("http://localhost/test");
    const info = extractWarpInfo(req);
    expect(info.connected).toBe(false);
  });

  it("detects WARP from JWT device_sessions", () => {
    const req = new Request("http://localhost/test");
    const payload = {
      device_sessions: {
        "device-abc-123": { last_authenticated: 1700000000 },
      },
    };
    const info = extractWarpInfo(req, payload);
    expect(info.connected).toBe(true);
    expect(info.deviceId).toBe("device-abc-123");
  });

  it("ignores empty device_sessions", () => {
    const req = new Request("http://localhost/test");
    const info = extractWarpInfo(req, { device_sessions: {} });
    expect(info.connected).toBe(false);
  });

  it("detects ASN 13335", () => {
    // Simulate cf object via Object.defineProperty since Request doesn't natively have .cf
    const req = new Request("http://localhost/test");
    Object.defineProperty(req, "cf", { value: { asn: 13335 } });
    const info = extractWarpInfo(req);
    expect(info.connected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyZtChallenge
// ---------------------------------------------------------------------------
describe("verifyZtChallenge", () => {
  const fingerprint = "a".repeat(64);

  it("accepts valid HMAC with current timestamp", async () => {
    const timestamp = Math.floor(Date.now() / 60000).toString();
    const response = await computeZtHmac(fingerprint, timestamp);
    const valid = await verifyZtChallenge(response, timestamp, fingerprint);
    expect(valid).toBe(true);
  });

  it("rejects stale timestamp (>2 min)", async () => {
    const staleMinute = Math.floor(Date.now() / 60000) - 3;
    const timestamp = staleMinute.toString();
    const response = await computeZtHmac(fingerprint, timestamp);
    const valid = await verifyZtChallenge(response, timestamp, fingerprint);
    expect(valid).toBe(false);
  });

  it("tolerates 1-minute clock skew", async () => {
    // Client computes for minute M, but server is at minute M+1
    const clientMinute = Math.floor(Date.now() / 60000);
    const timestamp = clientMinute.toString();
    // Compute HMAC for clientMinute - 1 (simulating that the client was 1 min behind)
    const response = await computeZtHmac(fingerprint, (clientMinute - 1).toString());
    // verifyZtChallenge checks timestamp's minute and timestamp's minute - 1
    const valid = await verifyZtChallenge(response, timestamp, fingerprint);
    expect(valid).toBe(true);
  });

  it("rejects wrong HMAC", async () => {
    const timestamp = Math.floor(Date.now() / 60000).toString();
    const valid = await verifyZtChallenge("deadbeef".repeat(8), timestamp, fingerprint);
    expect(valid).toBe(false);
  });

  it("rejects non-numeric timestamp", async () => {
    const valid = await verifyZtChallenge("abc", "notanumber", fingerprint);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkWarpRequired
// ---------------------------------------------------------------------------
describe("checkWarpRequired", () => {
  it("allows all when required=false", async () => {
    expect(await checkWarpRequired({ connected: false }, false)).toEqual({ allowed: true });
    expect(await checkWarpRequired({ connected: true }, false)).toEqual({ allowed: true });
  });

  it("rejects non-WARP when required=true", async () => {
    const result = await checkWarpRequired({ connected: false }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("WARP");
  });

  it("allows WARP-connected when required=true and no org fingerprint configured", async () => {
    const result = await checkWarpRequired({ connected: true }, true);
    expect(result).toEqual({ allowed: true });
  });

  it("rejects when storedFingerprint set but no challenge-response provided", async () => {
    const fp = "a".repeat(64);
    const result = await checkWarpRequired({ connected: true }, true, undefined, undefined, fp);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("challenge-response missing");
  });

  it("integrates challenge-response verification", async () => {
    const fp = "a".repeat(64);
    const timestamp = Math.floor(Date.now() / 60000).toString();
    const response = await computeZtHmac(fp, timestamp);
    const result = await checkWarpRequired({ connected: true }, true, response, timestamp, fp);
    expect(result.allowed).toBe(true);
  });

  it("rejects invalid challenge-response", async () => {
    const fp = "a".repeat(64);
    const timestamp = Math.floor(Date.now() / 60000).toString();
    const result = await checkWarpRequired(
      { connected: true },
      true,
      "bad".repeat(20),
      timestamp,
      fp,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("challenge-response invalid");
  });

  it("rejects device fingerprint mismatch", async () => {
    const orgFp = "a".repeat(64);
    const userFp = "b".repeat(64);
    const timestamp = Math.floor(Date.now() / 60000).toString();
    const response = await computeZtHmac(orgFp, timestamp);
    const result = await checkWarpRequired(
      { connected: true },
      true,
      response,
      timestamp,
      orgFp,
      userFp,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("device fingerprint mismatch");
  });

  it("allows matching device fingerprint", async () => {
    const fp = "a".repeat(64);
    const timestamp = Math.floor(Date.now() / 60000).toString();
    const response = await computeZtHmac(fp, timestamp);
    const result = await checkWarpRequired({ connected: true }, true, response, timestamp, fp, fp);
    expect(result.allowed).toBe(true);
  });
});
