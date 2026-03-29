import { AUTH_INTERACTIVE } from "./constants.js";
import type { AuthUser, Env } from "./types.js";

/** Compute SHA-256 chain hash including timestamp to prevent reordering. */
async function hashChainEntry(
  prevId: number,
  prevHash: string | null,
  timestamp: string,
  method: string,
  identity: string,
  action: string,
  secretKey: string | null,
): Promise<string> {
  const chainInput = `${prevId}|${prevHash ?? "genesis"}|${timestamp}|${method}|${identity}|${action}|${secretKey ?? ""}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chainInput));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Insert an audit entry with hash-chain integrity, self-healing under concurrency.
 *
 * The chain hash depends on the previous entry, but reading it and inserting are
 * separate D1 calls, so a concurrent insert can interleave. After our INSERT we
 * verify the entry immediately before ours is the one we hashed against; if not,
 * we recompute and UPDATE to repair the chain.
 */
async function auditInsert(
  db: D1Database,
  method: string,
  identity: string,
  action: string,
  secretKey: string | null,
  ip: string | null,
  userAgent: string | null,
  requestId: string | null,
  warpConnected = false,
): Promise<void> {
  // Generate timestamp in code so it's available for hashing before INSERT
  const timestamp = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "");

  const prev = await db
    .prepare("SELECT id, prev_hash FROM audit_log ORDER BY id DESC LIMIT 1")
    .first<{ id: number; prev_hash: string | null }>();
  const prevHash = await hashChainEntry(
    prev?.id ?? 0,
    prev?.prev_hash ?? null,
    timestamp,
    method,
    identity,
    action,
    secretKey,
  );

  const result = await db
    .prepare(
      "INSERT INTO audit_log (timestamp, method, identity, action, secret_key, ip, user_agent, request_id, prev_hash, warp_connected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      timestamp,
      method,
      identity,
      action,
      secretKey,
      ip,
      userAgent,
      requestId,
      prevHash,
      warpConnected ? 1 : 0,
    )
    .run();

  // Self-heal: if a concurrent insert landed between our SELECT and INSERT,
  // our prev_hash references the wrong entry. Detect and repair.
  const ourId = result.meta.last_row_id;
  if (ourId && prev) {
    const actualPrev = await db
      .prepare("SELECT id, prev_hash FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT 1")
      .bind(ourId)
      .first<{ id: number; prev_hash: string | null }>();
    if (actualPrev && actualPrev.id !== prev.id) {
      const correctHash = await hashChainEntry(
        actualPrev.id,
        actualPrev.prev_hash,
        timestamp,
        method,
        identity,
        action,
        secretKey,
      );
      await db
        .prepare("UPDATE audit_log SET prev_hash = ? WHERE id = ?")
        .bind(correctHash, ourId)
        .run();
    }
  }
}

export async function audit(
  env: Env,
  auth: AuthUser,
  action: string,
  secretKey: string | null,
  ip: string | null,
  userAgent: string | null = null,
  requestId: string | null = null,
): Promise<void> {
  const method = auth.method === AUTH_INTERACTIVE ? AUTH_INTERACTIVE : auth.name;
  await auditInsert(
    env.DB,
    method,
    auth.identity,
    action,
    secretKey,
    ip,
    userAgent,
    requestId,
    auth.warp?.connected ?? false,
  );
}

/** Audit logging for failed auth — no AuthUser available, uses raw method/identity strings. */
export async function auditRaw(
  db: D1Database,
  method: string,
  identity: string,
  action: string,
  secretKey: string | null,
  ip: string | null,
  userAgent: string | null,
  requestId: string | null,
  warpConnected = false,
): Promise<void> {
  await auditInsert(
    db,
    method,
    identity,
    action,
    secretKey,
    ip,
    userAgent,
    requestId,
    warpConnected,
  );
}
