import { describe, expect, it } from "vitest";
import { hasScope, isAdmin } from "../auth.js";
import type { AuthUser } from "../types.js";

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  const scopes = overrides.scopes ?? ["read"];
  const allowedTags = overrides.allowedTags ?? [];
  return {
    method: "interactive",
    identity: "test@example.com",
    name: "test",
    role: "reader",
    scopes,
    allowedTags,
    policies: [{ scopes, tags: allowedTags }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hasScope
// ---------------------------------------------------------------------------
describe("hasScope", () => {
  it("wildcard scope grants any required scope", () => {
    const user = makeUser({ scopes: ["*"] });
    expect(hasScope(user, "read")).toBe(true);
    expect(hasScope(user, "write")).toBe(true);
    expect(hasScope(user, "delete")).toBe(true);
  });

  it("read scope grants read", () => {
    const user = makeUser({ scopes: ["read"] });
    expect(hasScope(user, "read")).toBe(true);
  });

  it("read scope does not grant write", () => {
    const user = makeUser({ scopes: ["read"] });
    expect(hasScope(user, "write")).toBe(false);
  });

  it("read scope does not grant delete", () => {
    const user = makeUser({ scopes: ["read"] });
    expect(hasScope(user, "delete")).toBe(false);
  });

  it("read+write scopes do not grant delete", () => {
    const user = makeUser({ scopes: ["read", "write"] });
    expect(hasScope(user, "delete")).toBe(false);
  });

  it("read+write scopes grant write", () => {
    const user = makeUser({ scopes: ["read", "write"] });
    expect(hasScope(user, "write")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAdmin
// ---------------------------------------------------------------------------
describe("isAdmin", () => {
  it("returns true for admin role", () => {
    expect(isAdmin(makeUser({ role: "admin" }))).toBe(true);
  });

  it("returns false for reader role", () => {
    expect(isAdmin(makeUser({ role: "reader" }))).toBe(false);
  });

  it("returns false for operator role", () => {
    expect(isAdmin(makeUser({ role: "operator" }))).toBe(false);
  });

  it("returns false for empty role", () => {
    expect(isAdmin(makeUser({ role: "" }))).toBe(false);
  });
});
