import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../app.js";
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

// The dev auth bypass returns the first ALLOWED_EMAILS entry as identity.
// In vitest.config.mts, ALLOWED_EMAILS = "test@example.com".
const DEV_IDENTITY = "test@example.com";

beforeAll(async () => {
  await env.DB.exec(TEST_SCHEMA);
});

// Each test needs a clean users table so admin counts are predictable.
// We also ensure the "reader" role exists for demotion tests.
beforeEach(async () => {
  await env.DB.exec("DELETE FROM users");
  await env.DB.exec(
    "INSERT OR IGNORE INTO roles (name, scopes, description, created_by) VALUES ('reader', 'read', 'Read-only', 'test')",
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createRole(name: string, scopes = "read") {
  const res = await app.fetch(
    req(`/roles/${name}`, {
      method: "PUT",
      body: JSON.stringify({ name, scopes, description: `test role ${name}` }),
    }),
    env,
    ctx,
  );
  expect(res.status).toBe(201);
}

async function createUser(email: string, role: string, name = "") {
  const res = await app.fetch(
    req(`/users/${email}`, {
      method: "PUT",
      body: JSON.stringify({ email, name, role }),
    }),
    env,
    ctx,
  );
  expect(res.status).toBe(201);
}

// ---------------------------------------------------------------------------
// 1. Cannot delete built-in admin role
// ---------------------------------------------------------------------------
describe("cannot delete built-in admin role", () => {
  it("DELETE /roles/admin returns 400", async () => {
    const res = await app.fetch(req("/roles/admin", { method: "DELETE" }), env, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Cannot delete the built-in admin role");
  });
});

// ---------------------------------------------------------------------------
// 2. PUT /users last-admin protection
// ---------------------------------------------------------------------------
describe("PUT /users last-admin protection", () => {
  it("rejects demotion of the last admin via PUT", async () => {
    // Create a single admin
    await createUser("sole-admin@example.com", "admin", "Sole Admin");

    const row = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND enabled = 1",
    ).first<{ total: number }>();
    expect(row?.total).toBe(1);

    // Try to demote sole admin to reader
    const res = await app.fetch(
      req("/users/sole-admin@example.com", {
        method: "PUT",
        body: JSON.stringify({
          email: "sole-admin@example.com",
          name: "Sole Admin",
          role: "reader",
        }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Cannot remove the last admin");
  });
});

// ---------------------------------------------------------------------------
// 3. PATCH /users last-admin protection (role change)
// ---------------------------------------------------------------------------
describe("PATCH /users last-admin protection (role change)", () => {
  it("rejects role change from admin to reader when last admin", async () => {
    await createUser("sole-admin@example.com", "admin", "Sole Admin");

    const row = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND enabled = 1",
    ).first<{ total: number }>();
    expect(row?.total).toBe(1);

    const res = await app.fetch(
      req("/users/sole-admin@example.com", {
        method: "PATCH",
        body: JSON.stringify({ role: "reader" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Cannot remove the last admin");
  });
});

// ---------------------------------------------------------------------------
// 4. PATCH /users last-admin protection (disable)
// ---------------------------------------------------------------------------
describe("PATCH /users last-admin protection (disable)", () => {
  it("rejects disabling the last admin via PATCH", async () => {
    await createUser("sole-admin@example.com", "admin", "Sole Admin");

    const row = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND enabled = 1",
    ).first<{ total: number }>();
    expect(row?.total).toBe(1);

    const res = await app.fetch(
      req("/users/sole-admin@example.com", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Cannot remove the last admin");
  });
});

// ---------------------------------------------------------------------------
// 5. Self-deletion prevention
// ---------------------------------------------------------------------------
describe("self-deletion prevention", () => {
  it("DELETE /users/{self} returns 400 'Cannot delete yourself'", async () => {
    // Create the dev bypass identity as a user so the delete path is reached
    await createUser(DEV_IDENTITY, "admin", "Dev User");
    // Create a second admin so last-admin guard doesn't fire first
    await createUser("other-admin@example.com", "admin", "Other Admin");

    const res = await app.fetch(req(`/users/${DEV_IDENTITY}`, { method: "DELETE" }), env, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Cannot delete yourself");
  });
});

// ---------------------------------------------------------------------------
// 6. Cannot delete role with assigned users
// ---------------------------------------------------------------------------
describe("cannot delete role with assigned users", () => {
  it("DELETE /roles/{name} returns 400 when users are assigned", async () => {
    const roleName = "in-use-role";
    await createRole(roleName, "read");
    await createUser("assigned-user@example.com", roleName, "Assigned User");

    const res = await app.fetch(req(`/roles/${roleName}`, { method: "DELETE" }), env, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain(`Cannot delete role '${roleName}'`);
    expect(body.error).toContain("user(s) assigned");
  });
});
