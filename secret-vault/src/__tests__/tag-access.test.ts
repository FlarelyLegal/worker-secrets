import { describe, expect, it } from "vitest";
import { hasTagAccess } from "../auth.js";
import type { AuthUser } from "../types.js";

function makeUser(allowedTags: string[]): AuthUser {
  return {
    method: "interactive",
    identity: "test@example.com",
    name: "test",
    role: "reader",
    scopes: ["read"],
    allowedTags,
  };
}

describe("hasTagAccess", () => {
  it("empty allowedTags (unrestricted) grants access to any secret", () => {
    const user = makeUser([]);
    expect(hasTagAccess(user, "production")).toBe(true);
    expect(hasTagAccess(user, "ci,staging")).toBe(true);
    expect(hasTagAccess(user, "")).toBe(true);
  });

  it("allowedTags=['ci'] grants access when secret tags include 'ci'", () => {
    expect(hasTagAccess(makeUser(["ci"]), "ci")).toBe(true);
  });

  it("allowedTags=['ci'] grants access when secret has multiple tags including 'ci'", () => {
    expect(hasTagAccess(makeUser(["ci"]), "ci,production")).toBe(true);
  });

  it("allowedTags=['ci'] denies access when secret tags are 'production'", () => {
    expect(hasTagAccess(makeUser(["ci"]), "production")).toBe(false);
  });

  it("allowedTags=['ci'] denies access when secret tags are empty string", () => {
    expect(hasTagAccess(makeUser(["ci"]), "")).toBe(false);
  });

  it("allowedTags=['ci'] denies access when secret tags are undefined", () => {
    expect(hasTagAccess(makeUser(["ci"]), undefined as unknown as string)).toBe(false);
    expect(hasTagAccess(makeUser(["ci"]), null as unknown as string)).toBe(false);
  });

  it("allowedTags=['ci','staging'] grants access when secret tags include 'staging'", () => {
    expect(hasTagAccess(makeUser(["ci", "staging"]), "staging")).toBe(true);
  });

  it("does not substring-match: allowedTags=['ci'] denies 'ci-production'", () => {
    expect(hasTagAccess(makeUser(["ci"]), "ci-production")).toBe(false);
  });
});
