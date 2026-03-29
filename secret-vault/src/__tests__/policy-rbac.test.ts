import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessibleTags, hasAccess, hasScope } from "../auth.js";
import app from "../index.js";
import type { AuthUser, PolicyRule } from "../types.js";
import { TEST_SCHEMA } from "./setup-db.js";

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;
function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

function makeUser(policies: PolicyRule[], role = "custom"): AuthUser {
  const allScopes = [...new Set(policies.flatMap((p) => p.scopes))];
  const allTags = [...new Set(policies.flatMap((p) => p.tags))];
  return {
    method: "interactive",
    identity: "test@example.com",
    name: "test",
    role,
    scopes: allScopes,
    allowedTags: allTags,
    policies,
  };
}

beforeAll(async () => {
  await env.DB.exec(TEST_SCHEMA);
});

// ---------------------------------------------------------------------------
// 1. hasAccess with multi-policy users
// ---------------------------------------------------------------------------
describe("hasAccess with multiple policies", () => {
  const user = makeUser([
    { scopes: ["read"], tags: ["project-a"] },
    { scopes: ["read", "write"], tags: ["project-b"] },
  ]);

  it("grants read on project-a", () => {
    expect(hasAccess(user, "read", "project-a")).toBe(true);
  });

  it("denies write on project-a", () => {
    expect(hasAccess(user, "write", "project-a")).toBe(false);
  });

  it("grants read on project-b", () => {
    expect(hasAccess(user, "read", "project-b")).toBe(true);
  });

  it("grants write on project-b", () => {
    expect(hasAccess(user, "write", "project-b")).toBe(true);
  });

  it("denies delete on both projects", () => {
    expect(hasAccess(user, "delete", "project-a")).toBe(false);
    expect(hasAccess(user, "delete", "project-b")).toBe(false);
  });

  it("denies access to unrelated tags", () => {
    expect(hasAccess(user, "read", "project-c")).toBe(false);
  });

  it("denies access to untagged secrets when restricted", () => {
    expect(hasAccess(user, "read", "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. hasScope with multi-policy users
// ---------------------------------------------------------------------------
describe("hasScope with multiple policies", () => {
  const user = makeUser([
    { scopes: ["read"], tags: ["project-a"] },
    { scopes: ["write"], tags: ["project-b"] },
  ]);

  it("returns true for read (granted by first policy)", () => {
    expect(hasScope(user, "read")).toBe(true);
  });

  it("returns true for write (granted by second policy)", () => {
    expect(hasScope(user, "write")).toBe(true);
  });

  it("returns false for delete (not in any policy)", () => {
    expect(hasScope(user, "delete")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. accessibleTags
// ---------------------------------------------------------------------------
describe("accessibleTags", () => {
  it("returns null for unrestricted policy (empty tags)", () => {
    const user = makeUser([{ scopes: ["read"], tags: [] }]);
    expect(accessibleTags(user, "read")).toBeNull();
  });

  it("returns union of tags from policies granting the scope", () => {
    const user = makeUser([
      { scopes: ["read"], tags: ["a", "b"] },
      { scopes: ["read", "write"], tags: ["c"] },
    ]);
    const tags = accessibleTags(user, "read");
    expect(tags).not.toBeNull();
    expect(tags!.sort()).toEqual(["a", "b", "c"]);
  });

  it("only includes tags from policies that grant the requested scope", () => {
    const user = makeUser([
      { scopes: ["read"], tags: ["a"] },
      { scopes: ["write"], tags: ["b"] },
    ]);
    expect(accessibleTags(user, "read")).toEqual(["a"]);
    expect(accessibleTags(user, "write")).toEqual(["b"]);
  });

  it("returns null if any matching policy is unrestricted", () => {
    const user = makeUser([
      { scopes: ["read"], tags: ["a"] },
      { scopes: ["read"], tags: [] },
    ]);
    expect(accessibleTags(user, "read")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Wildcard admin policies
// ---------------------------------------------------------------------------
describe("admin wildcard policy", () => {
  const admin = makeUser([{ scopes: ["*"], tags: [] }], "admin");

  it("hasAccess grants any scope on any tags", () => {
    expect(hasAccess(admin, "read", "anything")).toBe(true);
    expect(hasAccess(admin, "write", "anything")).toBe(true);
    expect(hasAccess(admin, "delete", "anything")).toBe(true);
    expect(hasAccess(admin, "read", "")).toBe(true);
  });

  it("hasScope grants any scope", () => {
    expect(hasScope(admin, "read")).toBe(true);
    expect(hasScope(admin, "write")).toBe(true);
    expect(hasScope(admin, "delete")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Backward compat: role without policies uses roles table
// ---------------------------------------------------------------------------
describe("backward compat: role without policies", () => {
  const ROLE = "policy-compat-role";

  afterAll(async () => {
    await env.DB.prepare("DELETE FROM role_policies WHERE role = ?").bind(ROLE).run();
    await env.DB.prepare("DELETE FROM roles WHERE name = ?").bind(ROLE).run();
  });

  it("role with scopes+allowed_tags but no policies still works", async () => {
    // Create a role with legacy columns, no policies
    await env.DB.prepare(
      "INSERT OR REPLACE INTO roles (name, scopes, allowed_tags, description, created_by) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(ROLE, "read,write", "legacy-tag", "Legacy role", "test")
      .run();

    // Create a secret with matching tag
    await app.fetch(
      req("/secrets/policy-compat-secret", {
        method: "PUT",
        body: JSON.stringify({ value: "compat-val", tags: "legacy-tag" }),
      }),
      env,
      ctx,
    );

    // Verify via role list that role exists
    const rolesRes = await app.fetch(req("/roles"), env, ctx);
    expect(rolesRes.status).toBe(200);
    const roles = (await rolesRes.json()) as { roles: { name: string }[] };
    expect(roles.roles.some((r) => r.name === ROLE)).toBe(true);

    // Verify no policies exist for this role
    const policiesRes = await app.fetch(req(`/roles/${ROLE}/policies`), env, ctx);
    expect(policiesRes.status).toBe(200);
    const policiesBody = (await policiesRes.json()) as { policies: unknown[] };
    expect(policiesBody.policies.length).toBe(0);

    // Clean up secret
    await app.fetch(req("/secrets/policy-compat-secret", { method: "DELETE" }), env, ctx);
  });
});

// ---------------------------------------------------------------------------
// 6. Policy API: create role with policies, verify they persist
// ---------------------------------------------------------------------------
describe("policy API", () => {
  const ROLE = "policy-api-test";

  afterAll(async () => {
    await env.DB.prepare("DELETE FROM role_policies WHERE role = ?").bind(ROLE).run();
    await env.DB.prepare("DELETE FROM roles WHERE name = ?").bind(ROLE).run();
  });

  it("PUT policies replaces all policies for a role", async () => {
    // Create the role first
    const createRes = await app.fetch(
      req(`/roles/${ROLE}`, {
        method: "PUT",
        body: JSON.stringify({
          name: ROLE,
          scopes: "read",
          description: "API test role",
        }),
      }),
      env,
      ctx,
    );
    expect(createRes.status).toBe(201);

    // Set policies
    const putRes = await app.fetch(
      req(`/roles/${ROLE}/policies`, {
        method: "PUT",
        body: JSON.stringify({
          policies: [
            { scopes: "read", tags: "project-a", description: "Read project A" },
            { scopes: "read,write", tags: "project-b", description: "Full access project B" },
          ],
        }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { ok: boolean; count: number };
    expect(putBody.ok).toBe(true);
    expect(putBody.count).toBe(2);

    // List policies
    const listRes = await app.fetch(req(`/roles/${ROLE}/policies`), env, ctx);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      policies: { scopes: string; tags: string; description: string }[];
    };
    expect(listBody.policies.length).toBe(2);
    expect(listBody.policies[0].scopes).toBe("read");
    expect(listBody.policies[0].tags).toBe("project-a");
    expect(listBody.policies[1].scopes).toBe("read,write");
    expect(listBody.policies[1].tags).toBe("project-b");

    // Replace with single policy
    const replaceRes = await app.fetch(
      req(`/roles/${ROLE}/policies`, {
        method: "PUT",
        body: JSON.stringify({
          policies: [{ scopes: "read", tags: "only-this" }],
        }),
      }),
      env,
      ctx,
    );
    expect(replaceRes.status).toBe(200);

    // Verify replaced
    const listRes2 = await app.fetch(req(`/roles/${ROLE}/policies`), env, ctx);
    const listBody2 = (await listRes2.json()) as { policies: { tags: string }[] };
    expect(listBody2.policies.length).toBe(1);
    expect(listBody2.policies[0].tags).toBe("only-this");
  });

  it("PUT policies returns 404 for nonexistent role", async () => {
    const res = await app.fetch(
      req("/roles/nonexistent/policies", {
        method: "PUT",
        body: JSON.stringify({ policies: [{ scopes: "read" }] }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(404);
  });
});
