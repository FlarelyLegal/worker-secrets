import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { audit } from "../audit.js";
import { SCOPE_ALL } from "../constants.js";
import { loadAllFlags } from "../flags.js";
import * as adminService from "../services/admin.js";
import * as flagsService from "../services/flags.js";
import * as rolesService from "../services/roles.js";
import * as tokensService from "../services/tokens.js";
import type { ServiceContext } from "../services/types.js";
import * as usersService from "../services/users.js";
import type { AuthUser } from "../types.js";
import { TEST_SCHEMA } from "./setup-db.js";

/** Build a test ServiceContext with full admin access. */
async function buildTestCtx(identity = "test-rpc"): Promise<ServiceContext> {
  const auth: AuthUser = {
    method: "rpc",
    identity,
    name: identity,
    role: "admin",
    scopes: [SCOPE_ALL],
    allowedTags: [],
    policies: [{ scopes: [SCOPE_ALL], tags: [] }],
  };
  const flagCache = await loadAllFlags(env.FLAGS);
  return {
    db: env.DB,
    kv: env.FLAGS,
    env: env as never,
    auth,
    flagCache,
    requestId: crypto.randomUUID(),
    auditFn: (action, key) => audit(env as never, auth, action, key, null, "test", null),
    waitUntil: () => {},
  };
}

beforeAll(async () => {
  await env.DB.exec(TEST_SCHEMA);
});

describe("Tokens service via RPC context", () => {
  it("listTokens returns tokens array", async () => {
    const ctx = await buildTestCtx();
    const result = await tokensService.listTokens(ctx);
    expect(result).toHaveProperty("tokens");
    expect(Array.isArray(result.tokens)).toBe(true);
  });

  it("registerToken + revokeToken round-trip", async () => {
    const ctx = await buildTestCtx();
    // Check if client_secret_hash column exists; if not, add it for this test
    try {
      await ctx.db.exec("ALTER TABLE service_tokens ADD COLUMN client_secret_hash TEXT");
    } catch {
      // Column already exists
    }
    try {
      await ctx.db.exec("ALTER TABLE service_tokens ADD COLUMN age_public_key TEXT");
    } catch {
      // Column already exists
    }
    const reg = await tokensService.registerToken(ctx, "test-rpc-token", {
      name: "RPC Test Token",
      description: "For testing",
      scopes: "read",
    });
    expect(reg.ok).toBe(true);
    expect(reg.client_id).toBe("test-rpc-token");

    const revoke = await tokensService.revokeToken(ctx, "test-rpc-token");
    expect(revoke.ok).toBe(true);
  });
});

describe("Users service via RPC context", () => {
  it("listUsers returns users array", async () => {
    const ctx = await buildTestCtx();
    const result = await usersService.listUsers(ctx);
    expect(result).toHaveProperty("users");
    expect(Array.isArray(result.users)).toBe(true);
  });

  it("addUser + removeUser round-trip", async () => {
    const ctx = await buildTestCtx();
    // Create a reader role for the test user to avoid last-admin protection
    await ctx.db
      .prepare(
        "INSERT OR IGNORE INTO roles (name, scopes, description, created_by) VALUES ('reader', 'read', 'Read only', 'system')",
      )
      .run();
    const add = await usersService.addUser(ctx, "rpc-test@example.com", {
      name: "RPC Test",
      role: "reader",
    });
    expect(add.ok).toBe(true);

    const remove = await usersService.removeUser(ctx, "rpc-test@example.com");
    expect(remove.ok).toBe(true);
  });
});

describe("Roles service via RPC context", () => {
  it("listRoles returns roles array", async () => {
    const ctx = await buildTestCtx();
    const result = await rolesService.listRoles(ctx);
    expect(result).toHaveProperty("roles");
    expect(Array.isArray(result.roles)).toBe(true);
    // Should at least have the built-in admin role
    expect(result.roles.some((r) => r.name === "admin")).toBe(true);
  });

  it("setRole + deleteRole round-trip", async () => {
    const ctx = await buildTestCtx();
    const set = await rolesService.setRole(ctx, "rpc-test-role", {
      scopes: "read",
      allowed_tags: "",
      description: "test role",
    });
    expect(set.ok).toBe(true);

    const del = await rolesService.deleteRole(ctx, "rpc-test-role");
    expect(del.ok).toBe(true);
  });
});

describe("Flags service via RPC context", () => {
  it("listFlags returns flags array", async () => {
    const ctx = await buildTestCtx();
    const result = await flagsService.listFlags(ctx);
    expect(result).toHaveProperty("flags");
    expect(Array.isArray(result.flags)).toBe(true);
  });

  it("setFlag + getFlag + deleteFlag round-trip", async () => {
    const ctx = await buildTestCtx();
    const set = await flagsService.setFlag(ctx, "rpc-test-flag", {
      value: true,
      description: "test flag",
    });
    expect(set.key).toBe("rpc-test-flag");
    expect(set.value).toBe(true);
    expect(set.type).toBe("boolean");

    const get = await flagsService.getFlagByKey(ctx, "rpc-test-flag");
    expect(get.value).toBe(true);

    const del = await flagsService.deleteFlag(ctx, "rpc-test-flag");
    expect(del.ok).toBe(true);
  });
});

describe("Admin service via RPC context", () => {
  it("whoami returns method=rpc and identity", async () => {
    const ctx = await buildTestCtx("custom-identity");
    const result = await adminService.whoami(ctx);
    expect(result.method).toBe("rpc");
    expect(result.identity).toBe("custom-identity");
    expect(result).toHaveProperty("role");
    expect(result).toHaveProperty("scopes");
    expect(result).toHaveProperty("totalSecrets");
  });

  it("whoami defaults to service-binding identity", async () => {
    const ctx = await buildTestCtx();
    const result = await adminService.whoami(ctx);
    expect(result.identity).toBe("test-rpc");
  });

  it("getAuditLog returns entries array", async () => {
    const ctx = await buildTestCtx();
    const result = await adminService.getAuditLog(ctx, {});
    expect(result).toHaveProperty("entries");
    expect(Array.isArray(result.entries)).toBe(true);
  });
});
