import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { audit } from "../audit.js";
import { SCOPE_ALL } from "../constants.js";
import { loadAllFlags } from "../flags.js";
import * as bulkService from "../services/bulk.js";
import * as secretsService from "../services/secrets.js";
import type { ServiceContext } from "../services/types.js";
import * as versionsService from "../services/versions.js";
import type { AuthUser } from "../types.js";
import { TEST_SCHEMA } from "./setup-db.js";

/** Build a test ServiceContext with full admin access. */
async function buildTestCtx(): Promise<ServiceContext> {
	const auth: AuthUser = {
		method: "rpc",
		identity: "test-rpc",
		name: "test-rpc",
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
		auditFn: (action, key) =>
			audit(env as never, auth, action, key, null, "test", null),
		waitUntil: () => {},
	};
}

beforeAll(async () => {
	await env.DB.exec(TEST_SCHEMA);
});

describe("Core secrets service via RPC context", () => {
	it("setSecret + getSecret round-trip", async () => {
		const ctx = await buildTestCtx();
		await secretsService.setSecret(ctx, "rpc-test-key", {
			value: "hello-rpc",
			description: "test",
			tags: "",
			expires_at: null,
		});
		const result = await secretsService.getSecret(ctx, "rpc-test-key");
		expect(result.key).toBe("rpc-test-key");
		expect(result.value).toBe("hello-rpc");
	});

	it("listSecrets returns created secret", async () => {
		const ctx = await buildTestCtx();
		const result = await secretsService.listSecrets(ctx, {
			limit: 100,
			offset: 0,
		});
		expect(result.secrets.some((s) => s.key === "rpc-test-key")).toBe(true);
		expect(result.total).toBeGreaterThan(0);
	});

	it("deleteSecret removes it", async () => {
		const ctx = await buildTestCtx();
		await secretsService.deleteSecret(ctx, "rpc-test-key");
		await expect(
			secretsService.getSecret(ctx, "rpc-test-key"),
		).rejects.toThrow(/not found/i);
	});

	it("getSecret throws NotFoundError for missing key", async () => {
		const ctx = await buildTestCtx();
		await expect(
			secretsService.getSecret(ctx, "nonexistent"),
		).rejects.toThrow(/not found/i);
	});
});

describe("Core versions service", () => {
	it("versioning on update", async () => {
		const ctx = await buildTestCtx();
		await secretsService.setSecret(ctx, "ver-test", { value: "v1", description: "", tags: "", expires_at: null });
		await secretsService.setSecret(ctx, "ver-test", { value: "v2", description: "", tags: "", expires_at: null });
		const versions = await versionsService.listVersions(ctx, "ver-test");
		expect(versions.versions.length).toBeGreaterThanOrEqual(1);
		// Clean up
		await secretsService.deleteSecret(ctx, "ver-test");
	});

	it("getVersion returns decrypted value", async () => {
		const ctx = await buildTestCtx();
		await secretsService.setSecret(ctx, "ver-get-test", { value: "original", description: "", tags: "", expires_at: null });
		await secretsService.setSecret(ctx, "ver-get-test", { value: "updated", description: "", tags: "", expires_at: null });
		const { versions } = await versionsService.listVersions(
			ctx,
			"ver-get-test",
		);
		expect(versions.length).toBeGreaterThanOrEqual(1);
		const ver = await versionsService.getVersion(
			ctx,
			"ver-get-test",
			versions[0].id,
		);
		expect(ver.value).toBe("original");
		// Clean up
		await secretsService.deleteSecret(ctx, "ver-get-test");
	});

	it("restoreVersion restores a previous value", async () => {
		const ctx = await buildTestCtx();
		await secretsService.setSecret(ctx, "ver-restore", { value: "first", description: "", tags: "", expires_at: null });
		await secretsService.setSecret(ctx, "ver-restore", { value: "second", description: "", tags: "", expires_at: null });
		const { versions } = await versionsService.listVersions(
			ctx,
			"ver-restore",
		);
		const result = await versionsService.restoreVersion(
			ctx,
			"ver-restore",
			versions[0].id,
		);
		expect(result.ok).toBe(true);
		const restored = await secretsService.getSecret(ctx, "ver-restore");
		expect(restored.value).toBe("first");
		// Clean up
		await secretsService.deleteSecret(ctx, "ver-restore");
	});
});

describe("Core bulk service", () => {
	it("import + export round-trip", async () => {
		const ctx = await buildTestCtx();
		const importResult = await bulkService.importSecrets(ctx, {
			secrets: [
				{ key: "bulk-a", value: "val-a", description: "", tags: "", expires_at: null },
				{ key: "bulk-b", value: "val-b", description: "", tags: "", expires_at: null },
			],
			overwrite: true,
		});
		expect(importResult.imported).toBe(2);

		const exportResult = await bulkService.exportSecrets(ctx);
		const keys = exportResult.secrets.map((s) => s.key);
		expect(keys).toContain("bulk-a");
		expect(keys).toContain("bulk-b");

		// Clean up
		await secretsService.deleteSecret(ctx, "bulk-a");
		await secretsService.deleteSecret(ctx, "bulk-b");
	});

	it("import with overwrite=false skips existing", async () => {
		const ctx = await buildTestCtx();
		await secretsService.setSecret(ctx, "bulk-skip", { value: "original", description: "", tags: "", expires_at: null });
		const result = await bulkService.importSecrets(ctx, {
			secrets: [
				{ key: "bulk-skip", value: "new", description: "", tags: "", expires_at: null },
			],
			overwrite: false,
		});
		expect(result.skipped).toBe(1);
		expect(result.imported).toBe(0);
		const secret = await secretsService.getSecret(ctx, "bulk-skip");
		expect(secret.value).toBe("original");
		// Clean up
		await secretsService.deleteSecret(ctx, "bulk-skip");
	});
});
