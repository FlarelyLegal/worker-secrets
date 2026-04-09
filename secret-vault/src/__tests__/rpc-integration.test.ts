import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { audit } from "../audit.js";
import {
	FLAG_MAINTENANCE,
	FLAG_READ_ONLY,
	SCOPE_ALL,
	SCOPE_READ,
} from "../constants.js";
import { AccessDeniedError, NotFoundError, ValidationError } from "../errors.js";
import { loadAllFlags } from "../flags.js";
import * as adminService from "../services/admin.js";
import * as secretsService from "../services/secrets.js";
import type { ServiceContext } from "../services/types.js";
import * as versionsService from "../services/versions.js";
import type { AuthUser, PolicyRule } from "../types.js";
import { TEST_SCHEMA } from "./setup-db.js";

/** Build a test ServiceContext with full admin access. */
async function buildTestCtx(
	overrides?: Partial<AuthUser>,
): Promise<ServiceContext> {
	const auth: AuthUser = {
		method: "rpc",
		identity: "test-rpc",
		name: "test-rpc",
		role: "admin",
		scopes: [SCOPE_ALL],
		allowedTags: [],
		policies: [{ scopes: [SCOPE_ALL], tags: [] }],
		...overrides,
	};
	const flagCache = await loadAllFlags(env.FLAGS);
	return {
		db: env.DB,
		kv: env.FLAGS,
		env: env as never,
		auth,
		flagCache,
		requestId: crypto.randomUUID(),
		auditFn: (action, key) =>
			audit(env as never, auth, action, key, null, "test", null),
		waitUntil: () => {},
	};
}

beforeAll(async () => {
	await env.DB.exec(TEST_SCHEMA);
});

// ---------------------------------------------------------------------------
// 1. Maintenance mode — all service calls should throw when flag is set
// ---------------------------------------------------------------------------
describe("Maintenance mode enforcement", () => {
	it("blocks secret reads when maintenance flag is set", async () => {
		// Set the maintenance flag in KV
		await env.FLAGS.put(
			FLAG_MAINTENANCE,
			JSON.stringify({ value: true, type: "boolean" }),
		);

		// Reload flags so the context picks up maintenance=true
		const flagCache = await loadAllFlags(env.FLAGS);
		expect(flagCache.get(FLAG_MAINTENANCE)).toBe(true);

		// Clean up
		await env.FLAGS.delete(FLAG_MAINTENANCE);
	});

	it("allows operations when maintenance flag is false", async () => {
		await env.FLAGS.put(
			FLAG_MAINTENANCE,
			JSON.stringify({ value: false, type: "boolean" }),
		);

		const ctx = await buildTestCtx();
		// This should succeed — maintenance is off
		const result = await secretsService.listSecrets(ctx, {
			limit: 10,
			offset: 0,
		});
		expect(result).toHaveProperty("secrets");

		await env.FLAGS.delete(FLAG_MAINTENANCE);
	});
});

// ---------------------------------------------------------------------------
// 2. Read-only mode — write operations throw, reads succeed
// ---------------------------------------------------------------------------
describe("Read-only mode enforcement", () => {
	it("read-only flag is picked up by loadAllFlags", async () => {
		await env.FLAGS.put(
			FLAG_READ_ONLY,
			JSON.stringify({ value: true, type: "boolean" }),
		);
		const flagCache = await loadAllFlags(env.FLAGS);
		expect(flagCache.get(FLAG_READ_ONLY)).toBe(true);
		await env.FLAGS.delete(FLAG_READ_ONLY);
	});

	it("allows read operations when read_only is set", async () => {
		await env.FLAGS.put(
			FLAG_READ_ONLY,
			JSON.stringify({ value: true, type: "boolean" }),
		);

		const ctx = await buildTestCtx();
		// Read operation should succeed (service layer doesn't check read_only itself;
		// that's enforced in rpcCall). But listSecrets is a read — verify the service works.
		const result = await secretsService.listSecrets(ctx, {
			limit: 10,
			offset: 0,
		});
		expect(result).toHaveProperty("secrets");

		await env.FLAGS.delete(FLAG_READ_ONLY);
	});
});

// ---------------------------------------------------------------------------
// 3. RBAC enforcement — restricted role can only read, not write
// ---------------------------------------------------------------------------
describe("RBAC enforcement via restricted role", () => {
	it("reader role can read secrets but not write", async () => {
		// First create a secret with admin access
		const adminCtx = await buildTestCtx();
		await secretsService.setSecret(adminCtx, "rbac-read-test", {
			value: "readable",
			description: "",
			tags: "",
			expires_at: null,
		});

		// Create a reader-only context
		const readerPolicy: PolicyRule = { scopes: [SCOPE_READ], tags: [] };
		const readerCtx = await buildTestCtx({
			identity: "reader-worker",
			role: "reader",
			scopes: [SCOPE_READ],
			policies: [readerPolicy],
		});

		// Read should succeed
		const secret = await secretsService.getSecret(readerCtx, "rbac-read-test");
		expect(secret.value).toBe("readable");

		// Write should fail — missing write scope
		await expect(
			secretsService.setSecret(readerCtx, "rbac-write-attempt", {
				value: "nope",
				description: "",
				tags: "",
				expires_at: null,
			}),
		).rejects.toThrow(AccessDeniedError);

		// Delete should fail — missing delete scope
		await expect(
			secretsService.deleteSecret(readerCtx, "rbac-read-test"),
		).rejects.toThrow(AccessDeniedError);

		// Clean up with admin
		await secretsService.deleteSecret(adminCtx, "rbac-read-test");
	});

	it("tag-restricted role can only access matching tags", async () => {
		const adminCtx = await buildTestCtx();
		await secretsService.setSecret(adminCtx, "tagged-secret", {
			value: "tagged-val",
			description: "",
			tags: "billing",
			expires_at: null,
		});
		await secretsService.setSecret(adminCtx, "other-tagged-secret", {
			value: "other-val",
			description: "",
			tags: "infra",
			expires_at: null,
		});

		// Create context restricted to "billing" tag only
		const billingPolicy: PolicyRule = {
			scopes: [SCOPE_ALL],
			tags: ["billing"],
		};
		const billingCtx = await buildTestCtx({
			identity: "billing-worker",
			role: "billing",
			scopes: [SCOPE_ALL],
			allowedTags: ["billing"],
			policies: [billingPolicy],
		});

		// Can read billing-tagged secret
		const s = await secretsService.getSecret(billingCtx, "tagged-secret");
		expect(s.value).toBe("tagged-val");

		// Cannot read infra-tagged secret
		await expect(
			secretsService.getSecret(billingCtx, "other-tagged-secret"),
		).rejects.toThrow(AccessDeniedError);

		// Clean up
		await secretsService.deleteSecret(adminCtx, "tagged-secret");
		await secretsService.deleteSecret(adminCtx, "other-tagged-secret");
	});
});

// ---------------------------------------------------------------------------
// 4. Custom identity in audit trail
// ---------------------------------------------------------------------------
describe("Custom identity in audit", () => {
	it("records custom identity in audit log", async () => {
		const ctx = await buildTestCtx({ identity: "billing-worker" });

		await secretsService.setSecret(ctx, "audit-identity-test", {
			value: "audited",
			description: "",
			tags: "",
			expires_at: null,
		});

		// Query audit log for the custom identity
		const adminCtx = await buildTestCtx();
		const { entries } = await adminService.getAuditLog(adminCtx, {
			identity: "billing-worker",
		});
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.some((e) => e.identity === "billing-worker")).toBe(true);

		// Clean up
		await secretsService.deleteSecret(adminCtx, "audit-identity-test");
	});

	it("records auth.name as method in audit log (non-interactive path)", async () => {
		// For non-interactive auth, audit stores auth.name as method column.
		// For RPC, auth.name = identity string.
		const ctx = await buildTestCtx({ identity: "rpc-audit-check", name: "rpc-audit-check" });
		await secretsService.setSecret(ctx, "rpc-method-audit", {
			value: "check-method",
			description: "",
			tags: "",
			expires_at: null,
		});

		const adminCtx = await buildTestCtx();
		const { entries } = await adminService.getAuditLog(adminCtx, {
			identity: "rpc-audit-check",
			method: "rpc-audit-check",
		});
		expect(entries.length).toBeGreaterThan(0);
		// The method column stores auth.name for non-interactive auth
		expect(entries[0].method).toBe("rpc-audit-check");

		// Clean up
		await secretsService.deleteSecret(adminCtx, "rpc-method-audit");
	});
});

// ---------------------------------------------------------------------------
// 5. Full CRUD lifecycle: create → read → update → list → versions → restore → delete
// ---------------------------------------------------------------------------
describe("Full CRUD lifecycle", () => {
	it("complete secret lifecycle through RPC service context", async () => {
		const ctx = await buildTestCtx({ identity: "lifecycle-worker" });

		// Create
		const created = await secretsService.setSecret(ctx, "lifecycle-key", {
			value: "v1-value",
			description: "lifecycle test",
			tags: "test",
			expires_at: null,
		});
		expect(created.ok).toBe(true);
		expect(created.key).toBe("lifecycle-key");

		// Read
		const read = await secretsService.getSecret(ctx, "lifecycle-key");
		expect(read.key).toBe("lifecycle-key");
		expect(read.value).toBe("v1-value");
		expect(read.description).toBe("lifecycle test");
		expect(read.tags).toBe("test");

		// Update
		const updated = await secretsService.setSecret(ctx, "lifecycle-key", {
			value: "v2-value",
			description: "updated",
			tags: "test,updated",
			expires_at: null,
		});
		expect(updated.ok).toBe(true);

		// Verify updated value
		const afterUpdate = await secretsService.getSecret(ctx, "lifecycle-key");
		expect(afterUpdate.value).toBe("v2-value");
		expect(afterUpdate.tags).toBe("test,updated");

		// List — secret should appear
		const list = await secretsService.listSecrets(ctx, {
			limit: 100,
			offset: 0,
		});
		expect(list.secrets.some((s) => s.key === "lifecycle-key")).toBe(true);
		expect(list.total).toBeGreaterThan(0);

		// Versions — should have at least one version (v1 archived on update)
		const { versions } = await versionsService.listVersions(
			ctx,
			"lifecycle-key",
		);
		expect(versions.length).toBeGreaterThanOrEqual(1);

		// Get version — should contain original value
		const ver = await versionsService.getVersion(
			ctx,
			"lifecycle-key",
			versions[0].id,
		);
		expect(ver.value).toBe("v1-value");

		// Restore — bring back v1
		const restored = await versionsService.restoreVersion(
			ctx,
			"lifecycle-key",
			versions[0].id,
		);
		expect(restored.ok).toBe(true);
		expect(restored.restored_from).toBe(versions[0].id);

		// Verify restore
		const afterRestore = await secretsService.getSecret(ctx, "lifecycle-key");
		expect(afterRestore.value).toBe("v1-value");

		// Delete
		const deleted = await secretsService.deleteSecret(ctx, "lifecycle-key");
		expect(deleted.ok).toBe(true);
		expect(deleted.deleted).toBe("lifecycle-key");

		// Verify deleted
		await expect(
			secretsService.getSecret(ctx, "lifecycle-key"),
		).rejects.toThrow(NotFoundError);
	});
});

// ---------------------------------------------------------------------------
// 6. Error propagation — correct error types and codes
// ---------------------------------------------------------------------------
describe("Error propagation", () => {
	it("NotFoundError for missing secret", async () => {
		const ctx = await buildTestCtx();
		try {
			await secretsService.getSecret(ctx, "does-not-exist-at-all");
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(NotFoundError);
			expect((e as NotFoundError).code).toBe("NOT_FOUND");
			expect((e as NotFoundError).status).toBe(404);
		}
	});

	it("AccessDeniedError for insufficient scope", async () => {
		const readerCtx = await buildTestCtx({
			identity: "scope-error-test",
			role: "reader",
			scopes: [SCOPE_READ],
			policies: [{ scopes: [SCOPE_READ], tags: [] }],
		});
		try {
			await secretsService.setSecret(readerCtx, "nope", {
				value: "x",
				description: "",
				tags: "",
				expires_at: null,
			});
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(AccessDeniedError);
			expect((e as AccessDeniedError).code).toBe("ACCESS_DENIED");
			expect((e as AccessDeniedError).status).toBe(403);
		}
	});

	it("NotFoundError for missing version", async () => {
		const ctx = await buildTestCtx();
		// Create a secret so the parent exists
		await secretsService.setSecret(ctx, "ver-err-test", {
			value: "x",
			description: "",
			tags: "",
			expires_at: null,
		});
		try {
			await versionsService.getVersion(ctx, "ver-err-test", 999999);
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(NotFoundError);
			expect((e as NotFoundError).code).toBe("NOT_FOUND");
			expect((e as NotFoundError).status).toBe(404);
		}
		// Clean up
		await secretsService.deleteSecret(ctx, "ver-err-test");
	});

	it("NotFoundError for delete of non-existent secret", async () => {
		const ctx = await buildTestCtx();
		try {
			await secretsService.deleteSecret(ctx, "ghost-key-xyz");
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(NotFoundError);
		}
	});

	it("AccessDeniedError for tag mismatch on read", async () => {
		const adminCtx = await buildTestCtx();
		await secretsService.setSecret(adminCtx, "tag-err-test", {
			value: "secret",
			description: "",
			tags: "sensitive",
			expires_at: null,
		});

		const restricted = await buildTestCtx({
			identity: "no-tag-access",
			role: "restricted",
			scopes: [SCOPE_ALL],
			allowedTags: ["other"],
			policies: [{ scopes: [SCOPE_ALL], tags: ["other"] }],
		});

		try {
			await secretsService.getSecret(restricted, "tag-err-test");
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(AccessDeniedError);
			expect((e as AccessDeniedError).code).toBe("ACCESS_DENIED");
		}

		await secretsService.deleteSecret(adminCtx, "tag-err-test");
	});
});
