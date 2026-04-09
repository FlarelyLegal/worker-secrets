import { WorkerEntrypoint } from "cloudflare:workers";
import { audit, maybeCleanupAudit } from "./audit.js";
import { app } from "./app.js";
import {
	FLAG_MAINTENANCE,
	FLAG_READ_ONLY,
	SCOPE_ALL,
} from "./constants.js";
import { MaintenanceError, ReadOnlyError } from "./errors.js";
import { getFlag, loadAllFlags, type FlagCache } from "./flags.js";
import * as bulkService from "./services/bulk.js";
import * as secretsService from "./services/secrets.js";
import type { RpcOpts, ServiceContext } from "./services/types.js";
import * as versionsService from "./services/versions.js";
import type { AuthUser, Env, PolicyRule } from "./types.js";
import { fireWebhook } from "./webhook.js";

const WRITE_METHODS = new Set([
	"setSecret",
	"deleteSecret",
	"importSecrets",
	"registerToken",
	"revokeToken",
	"addUser",
	"updateUser",
	"removeUser",
	"setRole",
	"updateRole",
	"deleteRole",
	"setPolicies",
	"setFlag",
	"deleteFlag",
	"reEncrypt",
	"rotateKey",
	"restoreVersion",
]);

export default class SecretVaultWorker extends WorkerEntrypoint<Env> {
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request, this.env, this.ctx);
	}

	private async resolveAuth(
		opts: RpcOpts | undefined,
		db: D1Database,
	): Promise<AuthUser> {
		const identity = opts?.identity ?? "service-binding";
		const roleName = opts?.role;

		if (!roleName) {
			const policy: PolicyRule = { scopes: [SCOPE_ALL], tags: [] };
			return {
				method: "rpc",
				identity,
				name: identity,
				role: "admin",
				scopes: [SCOPE_ALL],
				allowedTags: [],
				policies: [policy],
			};
		}

		// Resolve role from DB — policy-based first, then legacy
		const { results: policyRows } = await db
			.prepare("SELECT scopes, tags FROM role_policies WHERE role = ?")
			.bind(roleName)
			.all<{ scopes: string; tags: string }>();

		if (policyRows.length > 0) {
			const policies: PolicyRule[] = policyRows.map((p) => ({
				scopes:
					p.scopes === SCOPE_ALL
						? [SCOPE_ALL]
						: p.scopes.split(",").map((s) => s.trim()),
				tags: p.tags
					? p.tags
							.split(",")
							.map((t) => t.trim())
							.filter(Boolean)
					: [],
			}));
			const allScopes = [...new Set(policies.flatMap((p) => p.scopes))];
			const allTags = [...new Set(policies.flatMap((p) => p.tags))];
			return {
				method: "rpc",
				identity,
				name: identity,
				role: roleName,
				scopes: allScopes,
				allowedTags: allTags,
				policies,
			};
		}

		const row = await db
			.prepare("SELECT scopes, allowed_tags FROM roles WHERE name = ?")
			.bind(roleName)
			.first<{ scopes: string; allowed_tags: string }>();

		if (!row) {
			const fallback: PolicyRule = { scopes: ["read"], tags: [] };
			return {
				method: "rpc",
				identity,
				name: identity,
				role: roleName,
				scopes: ["read"],
				allowedTags: [],
				policies: [fallback],
			};
		}

		const scopes =
			row.scopes === SCOPE_ALL
				? [SCOPE_ALL]
				: row.scopes.split(",").map((s) => s.trim());
		const allowedTags = row.allowed_tags
			? row.allowed_tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean)
			: [];
		const policy: PolicyRule = { scopes, tags: allowedTags };
		return {
			method: "rpc",
			identity,
			name: identity,
			role: roleName,
			scopes,
			allowedTags,
			policies: [policy],
		};
	}

	private buildContext(
		auth: AuthUser,
		flagCache: FlagCache,
		requestId: string,
		opts: RpcOpts | undefined,
	): ServiceContext {
		const ip = opts?.ip ?? null;
		const ua = opts?.userAgent ?? "rpc";
		return {
			db: this.env.DB,
			kv: this.env.FLAGS,
			env: this.env,
			auth,
			flagCache,
			requestId,
			auditFn: (action: string, key: string | null) =>
				audit(this.env, auth, action, key, ip, ua, requestId),
			waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p),
		};
	}

	protected async rpcCall<T>(
		methodName: string,
		opts: RpcOpts | undefined,
		fn: (ctx: ServiceContext) => Promise<T>,
	): Promise<T> {
		const requestId = crypto.randomUUID();
		const flagCache = await loadAllFlags(this.env.FLAGS);

		if (getFlag(flagCache, FLAG_MAINTENANCE, false))
			throw new MaintenanceError();
		if (WRITE_METHODS.has(methodName) && getFlag(flagCache, FLAG_READ_ONLY, false))
			throw new ReadOnlyError();

		const auth = await this.resolveAuth(opts, this.env.DB);
		const ctx = this.buildContext(auth, flagCache, requestId, opts);
		const result = await fn(ctx);

		fireWebhook(this.env.DB, requestId, (p) => this.ctx.waitUntil(p), flagCache);
		maybeCleanupAudit(this.env.DB, flagCache, (p) => this.ctx.waitUntil(p));

		return result;
	}

	// --- Secrets ---

	async getSecret(key: string, opts?: RpcOpts) {
		return this.rpcCall("getSecret", opts, (ctx) =>
			secretsService.getSecret(ctx, key),
		);
	}

	async setSecret(
		key: string,
		data: {
			value: string;
			description?: string;
			tags?: string;
			expires_at?: string;
		},
		opts?: RpcOpts,
	) {
		return this.rpcCall("setSecret", opts, (ctx) =>
			secretsService.setSecret(ctx, key, data),
		);
	}

	async deleteSecret(key: string, opts?: RpcOpts) {
		return this.rpcCall("deleteSecret", opts, (ctx) =>
			secretsService.deleteSecret(ctx, key),
		);
	}

	async listSecrets(
		params?: { limit?: number; offset?: number; search?: string },
		opts?: RpcOpts,
	) {
		return this.rpcCall("listSecrets", opts, (ctx) =>
			secretsService.listSecrets(ctx, {
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
				search: params?.search,
			}),
		);
	}

	// --- Bulk ---

	async exportSecrets(opts?: RpcOpts) {
		return this.rpcCall("exportSecrets", opts, (ctx) =>
			bulkService.exportSecrets(ctx),
		);
	}

	async importSecrets(
		data: {
			secrets: Array<{
				key: string;
				value: string;
				description?: string;
				tags?: string;
				expires_at?: string;
			}>;
			overwrite?: boolean;
		},
		opts?: RpcOpts,
	) {
		return this.rpcCall("importSecrets", opts, (ctx) =>
			bulkService.importSecrets(ctx, {
				secrets: data.secrets.map((s) => ({
					key: s.key,
					value: s.value,
					description: s.description ?? "",
					tags: s.tags ?? "",
					expires_at: s.expires_at ?? null,
				})),
				overwrite: data.overwrite ?? false,
			}),
		);
	}

	// --- Versions ---

	async listVersions(key: string, opts?: RpcOpts) {
		return this.rpcCall("listVersions", opts, (ctx) =>
			versionsService.listVersions(ctx, key),
		);
	}

	async getVersion(key: string, versionId: number, opts?: RpcOpts) {
		return this.rpcCall("getVersion", opts, (ctx) =>
			versionsService.getVersion(ctx, key, versionId),
		);
	}

	async restoreVersion(key: string, versionId: number, opts?: RpcOpts) {
		return this.rpcCall("restoreVersion", opts, (ctx) =>
			versionsService.restoreVersion(ctx, key, versionId),
		);
	}
}
