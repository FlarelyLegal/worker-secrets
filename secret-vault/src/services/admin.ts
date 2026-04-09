import { ACTION_RE_ENCRYPT, ACTION_ROTATE_KEY } from "../constants.js";
import { computeHmac, decrypt, envelopeEncrypt, verifyHmac } from "../crypto.js";
import type { SecretRow } from "../schemas-secrets.js";
import type { AuditConsumer, AuditEntry, ServiceContext } from "./types.js";

// --- Encoding helpers (for key rotation) ---

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(b64: string): Uint8Array {
  const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(standard), (ch) => ch.charCodeAt(0));
}

// --- Whoami ---

export type WhoamiResult = {
  method: string;
  identity: string;
  name: string;
  role: string;
  scopes: string[];
  e2e: boolean;
  deviceBound: boolean;
  policies: number;
  lastLogin: string | null;
  totalSecrets: number;
  warp?: {
    connected: boolean;
    ztVerified: boolean;
    deviceId?: string;
  };
};

export async function whoami(ctx: ServiceContext): Promise<WhoamiResult> {
  const auth = ctx.auth;

  // Enrich with user record details
  const user = await ctx.db
    .prepare(
      "SELECT age_public_key, zt_fingerprint, enabled, last_login_at FROM users WHERE email = ?",
    )
    .bind(auth.identity.toLowerCase())
    .first<{
      age_public_key: string | null;
      zt_fingerprint: string;
      enabled: number;
      last_login_at: string | null;
    }>();

  // Count policies for this role
  const policyCount = await ctx.db
    .prepare("SELECT COUNT(*) as total FROM role_policies WHERE role = ?")
    .bind(auth.role)
    .first<{ total: number }>();

  // Count accessible secrets
  const secretCount = await ctx.db
    .prepare("SELECT COUNT(*) as total FROM secrets")
    .first<{ total: number }>();

  const data: WhoamiResult = {
    method: auth.method,
    identity: auth.identity,
    name: auth.name,
    role: auth.role,
    scopes: auth.scopes,
    e2e: !!user?.age_public_key,
    deviceBound: !!user?.zt_fingerprint,
    policies: policyCount?.total ?? 0,
    lastLogin: user?.last_login_at ?? null,
    totalSecrets: secretCount?.total ?? 0,
    warp: auth.warp
      ? {
          connected: auth.warp.connected,
          ztVerified: auth.warp.ztVerified,
          deviceId: auth.warp.deviceId,
        }
      : undefined,
  };

  return data;
}

// --- Audit Log ---

export type AuditLogParams = {
  limit?: number;
  offset?: number;
  identity?: string;
  action?: string;
  key?: string;
  method?: string;
  from?: string;
  to?: string;
};

export async function getAuditLog(
  ctx: ServiceContext,
  params: AuditLogParams,
): Promise<{ entries: AuditEntry[] }> {
  const { limit = 50, offset = 0, identity, action, key, method, from, to } = params;
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (identity) {
    conditions.push("identity = ?");
    binds.push(identity);
  }
  if (action) {
    conditions.push("action = ?");
    binds.push(action);
  }
  if (key) {
    conditions.push("secret_key = ?");
    binds.push(key);
  }
  if (method) {
    conditions.push("method = ?");
    binds.push(method);
  }
  if (from) {
    conditions.push("timestamp >= ?");
    binds.push(from);
  }
  if (to) {
    conditions.push("timestamp <= ?");
    binds.push(to);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM audit_log${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const { results } = await ctx.db
    .prepare(sql)
    .bind(...binds, limit, offset)
    .all();

  return { entries: results as AuditEntry[] };
}

// --- Audit Consumers ---

export type AuditConsumersParams = {
  from?: string;
  to?: string;
};

export async function getAuditConsumers(
  ctx: ServiceContext,
  key: string,
  params?: AuditConsumersParams,
): Promise<{ consumers: AuditConsumer[] }> {
  const conditions: string[] = ["secret_key = ?", "action = 'get'"];
  const binds: unknown[] = [key];

  if (params?.from) {
    conditions.push("timestamp >= ?");
    binds.push(params.from);
  }
  if (params?.to) {
    conditions.push("timestamp <= ?");
    binds.push(params.to);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const sql = `
    SELECT
      identity,
      user_agent,
      method,
      COUNT(*) as access_count,
      MAX(timestamp) as last_accessed,
      MIN(timestamp) as first_accessed
    FROM audit_log
    ${where}
    GROUP BY identity, user_agent, method
    ORDER BY access_count DESC
  `;

  const { results } = await ctx.db
    .prepare(sql)
    .bind(...binds)
    .all();

  return { consumers: results as AuditConsumer[] };
}

// --- Re-encrypt ---

export async function reEncrypt(
  ctx: ServiceContext,
): Promise<{ ok: true; migrated: number; skipped: number }> {
  const { results } = await ctx.db.prepare("SELECT * FROM secrets").all();
  const rows = results as SecretRow[];

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.encrypted_dek && row.dek_iv) {
      skipped++;
      continue;
    }

    // Verify existing HMAC before migrating (if present)
    if (row.hmac) {
      const valid = await verifyHmac(
        row.key,
        row.value,
        row.iv,
        row.hmac,
        ctx.env.ENCRYPTION_KEY,
        ctx.env.INTEGRITY_KEY,
      );
      if (!valid) {
        skipped++;
        continue;
      }
    }

    let plaintext: string;
    try {
      plaintext = await decrypt(row.value, row.iv, ctx.env.ENCRYPTION_KEY, row.key);
    } catch {
      skipped++;
      continue;
    }

    const { ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
      plaintext,
      ctx.env.ENCRYPTION_KEY,
      row.key,
    );
    const hmac = await computeHmac(
      row.key,
      ciphertext,
      iv,
      ctx.env.ENCRYPTION_KEY,
      ctx.env.INTEGRITY_KEY,
      encrypted_dek,
      dek_iv,
    );

    await ctx.db
      .prepare(
        "UPDATE secrets SET value = ?, iv = ?, hmac = ?, encrypted_dek = ?, dek_iv = ?, updated_at = datetime('now') WHERE key = ?",
      )
      .bind(ciphertext, iv, hmac, encrypted_dek, dek_iv, row.key)
      .run();

    migrated++;
  }

  await ctx.auditFn(ACTION_RE_ENCRYPT, null);
  return { ok: true, migrated, skipped };
}

// --- Rotate Key ---

type VersionDekRow = {
  id: number;
  secret_key: string;
  value: string;
  iv: string;
  encrypted_dek: string;
  dek_iv: string;
};

export async function rotateKey(
  ctx: ServiceContext,
  newKey: string,
): Promise<{ ok: true; rotated: number; versions_rotated: number; legacy: number }> {
  const oldKey = ctx.env.ENCRYPTION_KEY;

  const oldKek = await crypto.subtle.importKey(
    "raw",
    hexToBytes(oldKey).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const newKek = await crypto.subtle.importKey(
    "raw",
    hexToBytes(newKey).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt"],
  );

  // Rotate secrets
  const { results } = await ctx.db.prepare("SELECT * FROM secrets").all();
  let rotated = 0;
  let legacy = 0;

  for (const row of results as SecretRow[]) {
    if (!row.encrypted_dek || !row.dek_iv) {
      legacy++;
      continue;
    }

    const dekRaw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(row.dek_iv) },
      oldKek,
      fromBase64url(row.encrypted_dek),
    );

    const newDekIv = crypto.getRandomValues(new Uint8Array(12));
    const newEncryptedDek = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: newDekIv },
      newKek,
      dekRaw,
    );

    const newDekB64 = toBase64url(newEncryptedDek);
    const newDekIvB64 = toBase64url(newDekIv);
    const hmac = await computeHmac(
      row.key,
      row.value,
      row.iv,
      newKey,
      ctx.env.INTEGRITY_KEY,
      newDekB64,
      newDekIvB64,
    );

    await ctx.db
      .prepare(
        "UPDATE secrets SET encrypted_dek = ?, dek_iv = ?, hmac = ?, updated_at = datetime('now') WHERE key = ?",
      )
      .bind(newDekB64, newDekIvB64, hmac, row.key)
      .run();
    rotated++;
  }

  // Rotate version DEKs
  let versionsRotated = 0;
  const { results: versionResults } = await ctx.db
    .prepare(
      "SELECT id, secret_key, value, iv, encrypted_dek, dek_iv FROM secret_versions WHERE encrypted_dek IS NOT NULL",
    )
    .all();

  for (const ver of versionResults as VersionDekRow[]) {
    const vDekRaw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(ver.dek_iv) },
      oldKek,
      fromBase64url(ver.encrypted_dek),
    );
    const vNewDekIv = crypto.getRandomValues(new Uint8Array(12));
    const vNewEncDek = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: vNewDekIv },
      newKek,
      vDekRaw,
    );
    const vDekB64 = toBase64url(vNewEncDek);
    const vDekIvB64 = toBase64url(vNewDekIv);
    const vHmac = await computeHmac(
      ver.secret_key,
      ver.value,
      ver.iv,
      newKey,
      ctx.env.INTEGRITY_KEY,
      vDekB64,
      vDekIvB64,
    );
    await ctx.db
      .prepare("UPDATE secret_versions SET encrypted_dek = ?, dek_iv = ?, hmac = ? WHERE id = ?")
      .bind(vDekB64, vDekIvB64, vHmac, ver.id)
      .run();
    versionsRotated++;
  }

  await ctx.auditFn(ACTION_ROTATE_KEY, null);
  return { ok: true, rotated, versions_rotated: versionsRotated, legacy };
}
