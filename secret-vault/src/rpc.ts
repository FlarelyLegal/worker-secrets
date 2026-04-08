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
import type { RpcOpts, ServiceContext } from "./services/types.js";
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

	// RPC methods will be added in Phase 2 and Phase 3
}
