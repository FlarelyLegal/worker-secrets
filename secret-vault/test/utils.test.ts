import { describe, it, expect } from "vitest";
import { parseTags, hasScope, isAdmin, hasAccess, accessibleTags } from "../src/access.js";
import { ScopesString } from "../src/schemas.js";
import { isSafeWebhookUrl } from "../src/webhook.js";
import type { AuthUser } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuth(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    method: "interactive",
    identity: "user@example.com",
    name: "Test User",
    role: "viewer",
    scopes: [],
    allowedTags: [],
    policies: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// access.ts - parseTags
// ---------------------------------------------------------------------------

describe("parseTags", () => {
  it("splits a comma-separated string into trimmed tokens", () => {
    expect(parseTags("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around each token", () => {
    expect(parseTags(" x , y ")).toEqual(["x", "y"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("filters out blank tokens produced by trailing commas", () => {
    expect(parseTags("a,b,")).toEqual(["a", "b"]);
  });

  it("handles a single token with no commas", () => {
    expect(parseTags("prod")).toEqual(["prod"]);
  });

  it("collapses tokens that become empty after trimming", () => {
    expect(parseTags("  ,  ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// access.ts - hasScope
// ---------------------------------------------------------------------------

describe("hasScope", () => {
  it("returns true when a policy contains the wildcard scope", () => {
    const auth = makeAuth({ policies: [{ scopes: ["*"], tags: [] }] });
    expect(hasScope(auth, "read")).toBe(true);
  });

  it("returns false when the only policy has a different scope", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read"], tags: [] }] });
    expect(hasScope(auth, "write")).toBe(false);
  });

  it("returns true when the required scope is present in a multi-scope policy", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read", "write"], tags: [] }] });
    expect(hasScope(auth, "read")).toBe(true);
  });

  it("returns false when the user has no policies", () => {
    const auth = makeAuth({ policies: [] });
    expect(hasScope(auth, "read")).toBe(false);
  });

  it("returns true when at least one policy grants the scope even if another does not", () => {
    const auth = makeAuth({
      policies: [
        { scopes: ["delete"], tags: [] },
        { scopes: ["read"], tags: [] },
      ],
    });
    expect(hasScope(auth, "read")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// access.ts - isAdmin
// ---------------------------------------------------------------------------

describe("isAdmin", () => {
  it("returns true when role is admin", () => {
    expect(isAdmin(makeAuth({ role: "admin" }))).toBe(true);
  });

  it("returns false when role is viewer", () => {
    expect(isAdmin(makeAuth({ role: "viewer" }))).toBe(false);
  });

  it("returns false when role is operator", () => {
    expect(isAdmin(makeAuth({ role: "operator" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// access.ts - hasAccess
// ---------------------------------------------------------------------------

describe("hasAccess", () => {
  it("returns true when a matching policy with no tag restriction covers the scope", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read"], tags: [] }] });
    expect(hasAccess(auth, "read", "prod")).toBe(true);
  });

  it("returns false when the only policy is read-only and write is required", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read"], tags: [] }] });
    expect(hasAccess(auth, "write", "prod")).toBe(false);
  });

  it("returns true when the policy tag list matches the secret's tags", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read"], tags: ["prod"] }] });
    expect(hasAccess(auth, "read", "prod,staging")).toBe(true);
  });

  it("returns false when the policy is tag-restricted and the secret has no matching tag", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read"], tags: ["prod"] }] });
    expect(hasAccess(auth, "read", "staging")).toBe(false);
  });

  it("returns false when the policy is tag-restricted and the secret has no tags at all", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read"], tags: ["prod"] }] });
    expect(hasAccess(auth, "read", "")).toBe(false);
  });

  it("returns true when a wildcard scope policy is unrestricted", () => {
    const auth = makeAuth({ policies: [{ scopes: ["*"], tags: [] }] });
    expect(hasAccess(auth, "delete", "internal")).toBe(true);
  });

  it("returns false when the user has no policies", () => {
    expect(hasAccess(makeAuth(), "read", "prod")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// access.ts - accessibleTags
// ---------------------------------------------------------------------------

describe("accessibleTags", () => {
  it("returns null when a matching policy carries no tag restriction (unrestricted)", () => {
    const auth = makeAuth({ policies: [{ scopes: ["read"], tags: [] }] });
    expect(accessibleTags(auth, "read")).toBeNull();
  });

  it("returns a deduplicated tag array when all matching policies are tag-restricted", () => {
    const auth = makeAuth({
      policies: [
        { scopes: ["read"], tags: ["prod", "staging"] },
        { scopes: ["read"], tags: ["staging", "qa"] },
      ],
    });
    const result = accessibleTags(auth, "read");
    expect(result).not.toBeNull();
    expect(result!.sort()).toEqual(["prod", "qa", "staging"]);
  });

  it("returns an empty array when no policy matches the required scope", () => {
    const auth = makeAuth({ policies: [{ scopes: ["write"], tags: ["prod"] }] });
    expect(accessibleTags(auth, "read")).toEqual([]);
  });

  it("returns null when any one matching policy is unrestricted even if others are not", () => {
    const auth = makeAuth({
      policies: [
        { scopes: ["read"], tags: ["prod"] },
        { scopes: ["read"], tags: [] }, // unrestricted
      ],
    });
    expect(accessibleTags(auth, "read")).toBeNull();
  });

  it("returns null for wildcard scope policy with no tag restriction", () => {
    const auth = makeAuth({ policies: [{ scopes: ["*"], tags: [] }] });
    expect(accessibleTags(auth, "read")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// schemas.ts - ScopesString
// ---------------------------------------------------------------------------

describe("ScopesString", () => {
  it('accepts "read"', () => {
    expect(() => ScopesString.parse("read")).not.toThrow();
  });

  it('accepts "read,write"', () => {
    expect(() => ScopesString.parse("read,write")).not.toThrow();
  });

  it('accepts "*"', () => {
    expect(() => ScopesString.parse("*")).not.toThrow();
  });

  it('accepts the full valid set "*, read, write, delete"', () => {
    expect(() => ScopesString.parse("*,read,write,delete")).not.toThrow();
  });

  it('rejects an unknown scope token "invalid"', () => {
    expect(() => ScopesString.parse("invalid")).toThrow();
  });

  it('rejects a mixed string containing an unknown token "read,invalid"', () => {
    expect(() => ScopesString.parse("read,invalid")).toThrow();
  });

  it("rejects an empty string (no valid tokens)", () => {
    expect(() => ScopesString.parse("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// webhook.ts - isSafeWebhookUrl
// ---------------------------------------------------------------------------

describe("isSafeWebhookUrl", () => {
  it("accepts a public HTTPS URL", () => {
    expect(isSafeWebhookUrl("https://hooks.slack.com/services/T000/B000/xxx")).toBe(true);
  });

  it("accepts another public HTTPS URL", () => {
    expect(isSafeWebhookUrl("https://api.example.com/webhook")).toBe(true);
  });

  // isSafeWebhookUrl only checks host safety, not the scheme.
  // The HTTPS guard lives in fireWebhook's caller site.
  it("accepts an HTTP URL pointing to a public host (scheme is not checked here)", () => {
    expect(isSafeWebhookUrl("http://example.com/hook")).toBe(true);
  });

  it("rejects localhost by hostname", () => {
    expect(isSafeWebhookUrl("https://localhost/hook")).toBe(false);
  });

  it("rejects 127.0.0.1", () => {
    expect(isSafeWebhookUrl("https://127.0.0.1/hook")).toBe(false);
  });

  it("rejects the IPv6 loopback ::1", () => {
    expect(isSafeWebhookUrl("https://[::1]/hook")).toBe(false);
  });

  it("rejects 0.0.0.0", () => {
    expect(isSafeWebhookUrl("https://0.0.0.0/hook")).toBe(false);
  });

  it("rejects a 192.168.x.x private range address", () => {
    expect(isSafeWebhookUrl("https://192.168.1.1/hook")).toBe(false);
  });

  it("rejects a 10.x.x.x private range address", () => {
    expect(isSafeWebhookUrl("https://10.0.0.1/hook")).toBe(false);
  });

  it("rejects a 172.16.x.x private range address", () => {
    expect(isSafeWebhookUrl("https://172.16.0.1/hook")).toBe(false);
  });

  it("rejects a 172.31.x.x private range address (upper boundary)", () => {
    expect(isSafeWebhookUrl("https://172.31.255.255/hook")).toBe(false);
  });

  it("accepts 172.32.x.x (just above the private 172.16-31 range)", () => {
    expect(isSafeWebhookUrl("https://172.32.0.1/hook")).toBe(true);
  });

  it("rejects a link-local 169.254.x.x address", () => {
    expect(isSafeWebhookUrl("https://169.254.1.1/hook")).toBe(false);
  });

  it("rejects a bare hostname with no dots or colons", () => {
    expect(isSafeWebhookUrl("https://intranet/hook")).toBe(false);
  });

  it("rejects a malformed URL string", () => {
    expect(isSafeWebhookUrl("not-a-url")).toBe(false);
  });
});
