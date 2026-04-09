import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app.js";
import { audit, maybeCleanupAudit } from "./audit.js";
import { FLAG_MAINTENANCE, FLAG_READ_ONLY, SCOPE_ALL } from "./constants.js";
import { MaintenanceError, ReadOnlyError } from "./errors.js";
import { type FlagCache, getFlag, loadAllFlags } from "./flags.js";
import * as adminService from "./services/admin.js";
import * as bulkService from "./services/bulk.js";
import * as flagsService from "./services/flags.js";
import * as policiesService from "./services/policies.js";
import * as recipientsService from "./services/recipients.js";
import * as rolesService from "./services/roles.js";
import * as secretsService from "./services/secrets.js";
import * as tokensService from "./services/tokens.js";
import type { RpcOpts, ServiceContext } from "./services/types.js";
import * as usersService from "./services/users.js";
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

  private async resolveAuth(opts: RpcOpts | undefined, db: D1Database): Promise<AuthUser> {
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
        scopes: p.scopes === SCOPE_ALL ? [SCOPE_ALL] : p.scopes.split(",").map((s) => s.trim()),
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
      row.scopes === SCOPE_ALL ? [SCOPE_ALL] : row.scopes.split(",").map((s) => s.trim());
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

    if (getFlag(flagCache, FLAG_MAINTENANCE, false)) throw new MaintenanceError();
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
    return this.rpcCall("getSecret", opts, (ctx) => secretsService.getSecret(ctx, key));
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
    return this.rpcCall("setSecret", opts, (ctx) => secretsService.setSecret(ctx, key, data));
  }

  async deleteSecret(key: string, opts?: RpcOpts) {
    return this.rpcCall("deleteSecret", opts, (ctx) => secretsService.deleteSecret(ctx, key));
  }

  async listSecrets(params?: { limit?: number; offset?: number; search?: string }, opts?: RpcOpts) {
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
    return this.rpcCall("exportSecrets", opts, (ctx) => bulkService.exportSecrets(ctx));
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
    return this.rpcCall("listVersions", opts, (ctx) => versionsService.listVersions(ctx, key));
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

  // --- Tokens ---

  async listTokens(opts?: RpcOpts) {
    return this.rpcCall("listTokens", opts, (ctx) => tokensService.listTokens(ctx));
  }

  async registerToken(
    clientId: string,
    data: {
      name: string;
      description?: string;
      scopes?: string;
      role?: string;
      client_secret_hash?: string;
      age_public_key?: string;
    },
    opts?: RpcOpts,
  ) {
    return this.rpcCall("registerToken", opts, (ctx) =>
      tokensService.registerToken(ctx, clientId, {
        name: data.name,
        description: data.description ?? "",
        scopes: data.scopes ?? "*",
        role: data.role,
        client_secret_hash: data.client_secret_hash,
        age_public_key: data.age_public_key,
      }),
    );
  }

  async revokeToken(clientId: string, opts?: RpcOpts) {
    return this.rpcCall("revokeToken", opts, (ctx) => tokensService.revokeToken(ctx, clientId));
  }

  // --- Users ---

  async listUsers(opts?: RpcOpts) {
    return this.rpcCall("listUsers", opts, (ctx) => usersService.listUsers(ctx));
  }

  async addUser(email: string, data: { name: string; role: string }, opts?: RpcOpts) {
    return this.rpcCall("addUser", opts, (ctx) => usersService.addUser(ctx, email, data));
  }

  async updateUser(
    email: string,
    data: {
      name?: string;
      role?: string;
      enabled?: boolean;
      age_public_key?: string | null;
      zt_fingerprint?: string | null;
    },
    opts?: RpcOpts,
  ) {
    return this.rpcCall("updateUser", opts, (ctx) => usersService.updateUser(ctx, email, data));
  }

  async removeUser(email: string, opts?: RpcOpts) {
    return this.rpcCall("removeUser", opts, (ctx) => usersService.removeUser(ctx, email));
  }

  // --- Roles ---

  async listRoles(opts?: RpcOpts) {
    return this.rpcCall("listRoles", opts, (ctx) => rolesService.listRoles(ctx));
  }

  async setRole(
    name: string,
    data: { scopes: string; allowed_tags?: string; description?: string },
    opts?: RpcOpts,
  ) {
    return this.rpcCall("setRole", opts, (ctx) =>
      rolesService.setRole(ctx, name, {
        scopes: data.scopes,
        allowed_tags: data.allowed_tags ?? "",
        description: data.description ?? "",
      }),
    );
  }

  async updateRole(
    name: string,
    data: { scopes?: string; allowed_tags?: string; description?: string },
    opts?: RpcOpts,
  ) {
    return this.rpcCall("updateRole", opts, (ctx) => rolesService.updateRole(ctx, name, data));
  }

  async deleteRole(name: string, opts?: RpcOpts) {
    return this.rpcCall("deleteRole", opts, (ctx) => rolesService.deleteRole(ctx, name));
  }

  // --- Policies ---

  async listPolicies(roleName: string, opts?: RpcOpts) {
    return this.rpcCall("listPolicies", opts, (ctx) => policiesService.listPolicies(ctx, roleName));
  }

  async setPolicies(
    roleName: string,
    policies: Array<{ scopes: string; tags: string; description?: string }>,
    opts?: RpcOpts,
  ) {
    return this.rpcCall("setPolicies", opts, (ctx) =>
      policiesService.setPolicies(
        ctx,
        roleName,
        policies.map((p) => ({
          scopes: p.scopes,
          tags: p.tags,
          description: p.description ?? "",
        })),
      ),
    );
  }

  // --- Flags ---

  async listFlags(opts?: RpcOpts) {
    return this.rpcCall("listFlags", opts, (ctx) => flagsService.listFlags(ctx));
  }

  async getFlag(key: string, opts?: RpcOpts) {
    return this.rpcCall("getFlag", opts, (ctx) => flagsService.getFlagByKey(ctx, key));
  }

  async setFlag(key: string, data: { value: unknown; description?: string }, opts?: RpcOpts) {
    return this.rpcCall("setFlag", opts, (ctx) => flagsService.setFlag(ctx, key, data));
  }

  async deleteFlag(key: string, opts?: RpcOpts) {
    return this.rpcCall("deleteFlag", opts, (ctx) => flagsService.deleteFlag(ctx, key));
  }

  // --- Admin ---

  async whoami(opts?: RpcOpts) {
    return this.rpcCall("whoami", opts, (ctx) => adminService.whoami(ctx));
  }

  async getAuditLog(
    params?: {
      limit?: number;
      offset?: number;
      identity?: string;
      action?: string;
      key?: string;
      method?: string;
      from?: string;
      to?: string;
    },
    opts?: RpcOpts,
  ) {
    return this.rpcCall("getAuditLog", opts, (ctx) => adminService.getAuditLog(ctx, params ?? {}));
  }

  async getAuditConsumers(key: string, params?: { from?: string; to?: string }, opts?: RpcOpts) {
    return this.rpcCall("getAuditConsumers", opts, (ctx) =>
      adminService.getAuditConsumers(ctx, key, params),
    );
  }

  async reEncrypt(opts?: RpcOpts) {
    return this.rpcCall("reEncrypt", opts, (ctx) => adminService.reEncrypt(ctx));
  }

  async rotateKey(newKey: string, opts?: RpcOpts) {
    return this.rpcCall("rotateKey", opts, (ctx) => adminService.rotateKey(ctx, newKey));
  }

  // --- Recipients ---

  async getRecipients(params?: { tags?: string }, opts?: RpcOpts) {
    return this.rpcCall("getRecipients", opts, (ctx) =>
      recipientsService.getRecipients(ctx, params),
    );
  }
}
