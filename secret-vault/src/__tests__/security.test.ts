import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../index.js";
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

beforeAll(async () => {
  await env.DB.exec(TEST_SCHEMA);
});

// ---------------------------------------------------------------------------
// 1. Re-encrypt endpoint
// ---------------------------------------------------------------------------
describe("re-encrypt endpoint", () => {
  const KEY = "sec-reencrypt-test";

  afterAll(async () => {
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("POST /admin/re-encrypt migrates secrets and returns 200 with migrated count", async () => {
    // Create a secret (will use envelope encryption by default)
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "re-encrypt-me", description: "reencrypt test" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // Call re-encrypt
    const reencryptRes = await app.fetch(req("/admin/re-encrypt", { method: "POST" }), env, ctx);
    expect(reencryptRes.status).toBe(200);
    const body = (await reencryptRes.json()) as { ok: boolean; migrated: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(typeof body.migrated).toBe("number");
    expect(typeof body.skipped).toBe("number");
    // Since the secret was already envelope-encrypted, it should be skipped
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Version restore preserves envelope encryption
// ---------------------------------------------------------------------------
describe("version restore preserves envelope encryption", () => {
  const KEY = "sec-version-restore";

  afterAll(async () => {
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("restoring a version yields the original v1 value via decryption", async () => {
    // PUT v1
    const put1 = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "original-value-v1", description: "v1" }),
      }),
      env,
      ctx,
    );
    expect(put1.status).toBe(201);

    // PUT v2 (archives v1)
    const put2 = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "updated-value-v2", description: "v2" }),
      }),
      env,
      ctx,
    );
    expect(put2.status).toBe(201);

    // GET versions to find the archived v1 id
    const versionsRes = await app.fetch(req(`/secrets/${KEY}/versions`), env, ctx);
    expect(versionsRes.status).toBe(200);
    const versionsBody = (await versionsRes.json()) as {
      versions: { id: number; changed_by: string; changed_at: string }[];
    };
    expect(versionsBody.versions.length).toBeGreaterThanOrEqual(1);

    // The oldest version (last in DESC order) is v1
    const v1Id = versionsBody.versions[versionsBody.versions.length - 1].id;

    // Restore v1
    const restoreRes = await app.fetch(
      req(`/secrets/${KEY}/versions/${v1Id}/restore`, { method: "POST" }),
      env,
      ctx,
    );
    expect(restoreRes.status).toBe(200);
    const restoreBody = (await restoreRes.json()) as {
      ok: boolean;
      key: string;
      restored_from: number;
    };
    expect(restoreBody.ok).toBe(true);
    expect(restoreBody.restored_from).toBe(v1Id);

    // GET the secret — should decrypt to the v1 value
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { value: string; description: string };
    expect(getBody.value).toBe("original-value-v1");
    expect(getBody.description).toBe("v1");
  });
});

// ---------------------------------------------------------------------------
// 3. expires_at validation
// ---------------------------------------------------------------------------
describe("expires_at validation", () => {
  const KEY_BAD = "sec-expiry-bad";
  const KEY_GOOD = "sec-expiry-good";

  afterAll(async () => {
    await app.fetch(req(`/secrets/${KEY_BAD}`, { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY_GOOD}`, { method: "DELETE" }), env, ctx);
  });

  it("PUT with invalid expires_at returns 400", async () => {
    const res = await app.fetch(
      req(`/secrets/${KEY_BAD}`, {
        method: "PUT",
        body: JSON.stringify({ value: "val", expires_at: "not-a-date" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("PUT with valid expires_at returns 201", async () => {
    const res = await app.fetch(
      req(`/secrets/${KEY_GOOD}`, {
        method: "PUT",
        body: JSON.stringify({ value: "val", expires_at: "2026-12-31" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 4. HMAC verification on GET (end-to-end write+verify cycle)
// ---------------------------------------------------------------------------
describe("HMAC verification on GET", () => {
  const KEY = "sec-hmac-cycle";

  afterAll(async () => {
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("GET after PUT returns correct value (proves HMAC write+verify cycle works)", async () => {
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "hmac-protected-value", description: "hmac test" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // Confirm the DB row has an HMAC populated
    const row = await env.DB.prepare("SELECT hmac FROM secrets WHERE key = ?")
      .bind(KEY)
      .first<{ hmac: string }>();
    expect(row).not.toBeNull();
    expect(row?.hmac).toBeTruthy();
    expect(row?.hmac.length).toBeGreaterThan(0);

    // GET should succeed (HMAC verification passes internally)
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { value: string };
    expect(body.value).toBe("hmac-protected-value");
  });
});

// ---------------------------------------------------------------------------
// 5. Audit hash chain
// ---------------------------------------------------------------------------
describe("audit hash chain", () => {
  const KEY = "sec-audit-chain";

  afterAll(async () => {
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("audit entries have prev_hash populated after operations", async () => {
    // Perform a few operations to generate audit entries
    await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "chain-v1" }),
      }),
      env,
      ctx,
    );
    await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "chain-v2" }),
      }),
      env,
      ctx,
    );

    // Query the audit log
    const auditRes = await app.fetch(req(`/audit?key=${KEY}`), env, ctx);
    expect(auditRes.status).toBe(200);
    const auditBody = (await auditRes.json()) as {
      entries: { id: number; action: string; prev_hash: string | null }[];
    };
    expect(auditBody.entries.length).toBeGreaterThanOrEqual(3);

    // Every entry created by the hash-chaining audit function should have prev_hash set
    for (const entry of auditBody.entries) {
      expect(entry.prev_hash).not.toBeNull();
      expect(typeof entry.prev_hash).toBe("string");
      expect((entry.prev_hash as string).length).toBeGreaterThan(0);
    }
  });
});
