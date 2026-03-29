import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
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
// 1. Envelope encryption round-trip
// ---------------------------------------------------------------------------
describe("envelope encryption round-trip", () => {
  const KEY = "rbac-enc-roundtrip";

  it("PUT then GET returns the same plaintext value", async () => {
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "super-secret-123", description: "encryption test" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as Record<string, unknown>;
    expect(body.value).toBe("super-secret-123");
    expect(body.description).toBe("encryption test");

    // Clean up
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("stored ciphertext differs from plaintext (DB row is encrypted)", async () => {
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "plaintext-value" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // Read the raw DB row — value should NOT be the plaintext
    const row = await env.DB.prepare(
      "SELECT value, iv, encrypted_dek, dek_iv FROM secrets WHERE key = ?",
    )
      .bind(KEY)
      .first<{ value: string; iv: string; encrypted_dek: string; dek_iv: string }>();
    expect(row).not.toBeNull();
    expect(row?.value).not.toBe("plaintext-value");
    // Envelope encryption columns should be populated
    expect(row?.encrypted_dek).toBeTruthy();
    expect(row?.dek_iv).toBeTruthy();

    // Clean up
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });
});

// ---------------------------------------------------------------------------
// 2. Tags in responses
// ---------------------------------------------------------------------------
describe("tags in responses", () => {
  const KEY = "rbac-tags-test";

  it("PUT with tags, GET returns tags, LIST returns tags", async () => {
    // Create
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({
          value: "tagged-val",
          description: "tag test",
          tags: "production,ci",
        }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // GET single
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as Record<string, unknown>;
    expect(getBody.tags).toBe("production,ci");

    // LIST
    const listRes = await app.fetch(req("/secrets?search=rbac-tags"), env, ctx);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { secrets: { key: string; tags: string }[] };
    const found = listBody.secrets.find((s) => s.key === KEY);
    expect(found).toBeDefined();
    expect(found?.tags).toBe("production,ci");

    // Clean up
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });
});

// ---------------------------------------------------------------------------
// 3. expires_at in responses
// ---------------------------------------------------------------------------
describe("expires_at in responses", () => {
  const KEY = "rbac-expiry-test";

  it("PUT with expires_at, GET returns it", async () => {
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({
          value: "expiring-val",
          description: "expiry test",
          expires_at: "2026-12-31 23:59:59",
        }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as Record<string, unknown>;
    expect(body.expires_at).toBe("2026-12-31 23:59:59");

    // Clean up
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });
});

// ---------------------------------------------------------------------------
// 4. Version restore
// ---------------------------------------------------------------------------
describe("version restore", () => {
  const KEY = "rbac-version-test";

  it("PUT twice, list versions, restore first version, verify value", async () => {
    // First version
    const put1 = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "version-one", description: "v1" }),
      }),
      env,
      ctx,
    );
    expect(put1.status).toBe(201);

    // Second version (overwrites first, first gets archived)
    const put2 = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "version-two", description: "v2" }),
      }),
      env,
      ctx,
    );
    expect(put2.status).toBe(201);

    // Current value should be v2
    const getV2 = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getV2.status).toBe(200);
    const v2Body = (await getV2.json()) as Record<string, unknown>;
    expect(v2Body.value).toBe("version-two");

    // List versions — should have at least 1 archived version (v1)
    const versionsRes = await app.fetch(req(`/secrets/${KEY}/versions`), env, ctx);
    expect(versionsRes.status).toBe(200);
    const versionsBody = (await versionsRes.json()) as {
      versions: { id: number; changed_by: string; changed_at: string }[];
    };
    expect(versionsBody.versions.length).toBeGreaterThanOrEqual(1);

    // Restore the first archived version (oldest = last in DESC order)
    const versionId = versionsBody.versions[versionsBody.versions.length - 1].id;
    const restoreRes = await app.fetch(
      req(`/secrets/${KEY}/versions/${versionId}/restore`, { method: "POST" }),
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
    expect(restoreBody.key).toBe(KEY);
    expect(restoreBody.restored_from).toBe(versionId);

    // After restore, there should be more versions (current was archived before overwrite)
    const versionsAfter = await app.fetch(req(`/secrets/${KEY}/versions`), env, ctx);
    expect(versionsAfter.status).toBe(200);
    const versionsAfterBody = (await versionsAfter.json()) as { versions: { id: number }[] };
    expect(versionsAfterBody.versions.length).toBeGreaterThan(versionsBody.versions.length);

    // Verify the DB row description was restored to v1
    const row = await env.DB.prepare("SELECT description FROM secrets WHERE key = ?")
      .bind(KEY)
      .first<{ description: string }>();
    expect(row).not.toBeNull();
    expect(row?.description).toBe("v1");

    // Clean up
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });
});

// ---------------------------------------------------------------------------
// 5. Audit filtering
// ---------------------------------------------------------------------------
describe("audit filtering", () => {
  const KEY = "rbac-audit-test";

  it("actions are logged and /audit?action=set filters correctly", async () => {
    // Produce some audit entries
    await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "audit-val" }),
      }),
      env,
      ctx,
    );
    await app.fetch(req(`/secrets/${KEY}`), env, ctx);

    // Query audit with action=set filter
    const auditRes = await app.fetch(req("/audit?action=set"), env, ctx);
    expect(auditRes.status).toBe(200);
    const auditBody = (await auditRes.json()) as {
      entries: { action: string; secret_key: string | null }[];
    };
    expect(auditBody.entries.length).toBeGreaterThanOrEqual(1);
    // Every returned entry should have action === "set"
    for (const entry of auditBody.entries) {
      expect(entry.action).toBe("set");
    }

    // Query audit with action=get filter
    const auditGetRes = await app.fetch(req("/audit?action=get"), env, ctx);
    expect(auditGetRes.status).toBe(200);
    const auditGetBody = (await auditGetRes.json()) as { entries: { action: string }[] };
    expect(auditGetBody.entries.length).toBeGreaterThanOrEqual(1);
    for (const entry of auditGetBody.entries) {
      expect(entry.action).toBe("get");
    }

    // Clean up
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });
});

// ---------------------------------------------------------------------------
// 6. Feature flag: require_description
// ---------------------------------------------------------------------------
describe("feature flag: require_description", () => {
  const FLAG_KEY = "require_description";

  it("rejects secrets without description when flag is enabled", async () => {
    // Enable the flag
    const setFlagRes = await app.fetch(
      req(`/flags/${FLAG_KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // Try to PUT a secret without description — should be rejected
    const putRes = await app.fetch(
      req("/secrets/rbac-nodesc", {
        method: "PUT",
        body: JSON.stringify({ value: "no-desc" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(400);
    const body = (await putRes.json()) as { error: string };
    expect(body.error).toContain("Description is required");

    // With description should succeed
    const putOkRes = await app.fetch(
      req("/secrets/rbac-withdesc", {
        method: "PUT",
        body: JSON.stringify({ value: "has-desc", description: "my desc" }),
      }),
      env,
      ctx,
    );
    expect(putOkRes.status).toBe(201);

    // Clean up: delete flag and secret
    await app.fetch(req(`/flags/${FLAG_KEY}`, { method: "DELETE" }), env, ctx);
    await app.fetch(req("/secrets/rbac-withdesc", { method: "DELETE" }), env, ctx);
  });
});

// ---------------------------------------------------------------------------
// 7. Feature flag: disable_export
// ---------------------------------------------------------------------------
describe("feature flag: disable_export", () => {
  const FLAG_KEY = "disable_export";

  it("blocks GET /secrets/export when flag is enabled", async () => {
    // Enable the flag
    const setFlagRes = await app.fetch(
      req(`/flags/${FLAG_KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // Try to export — should be blocked
    const exportRes = await app.fetch(req("/secrets/export"), env, ctx);
    expect(exportRes.status).toBe(403);
    const body = (await exportRes.json()) as { error: string };
    expect(body.error).toContain("disabled");

    // Clean up the flag
    await app.fetch(req(`/flags/${FLAG_KEY}`, { method: "DELETE" }), env, ctx);

    // After removing the flag, export should work (200)
    const exportOkRes = await app.fetch(req("/secrets/export"), env, ctx);
    expect(exportOkRes.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 8. Health check includes KV
// ---------------------------------------------------------------------------
describe("health check", () => {
  it("GET /health returns status, database, and kv fields", async () => {
    const res = await app.fetch(req("/health"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("database");
    expect(body).toHaveProperty("kv");
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(body.kv).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// 9. Reserved key names
// ---------------------------------------------------------------------------
describe("reserved key names", () => {
  it("PUT /secrets/export returns 400", async () => {
    const res = await app.fetch(
      req("/secrets/export", {
        method: "PUT",
        body: JSON.stringify({ value: "x" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("PUT /secrets/import returns 400", async () => {
    const res = await app.fetch(
      req("/secrets/import", {
        method: "PUT",
        body: JSON.stringify({ value: "x" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 10. Self-deletion protection
// ---------------------------------------------------------------------------
describe("self-deletion protection", () => {
  it("DELETE /users/{own-email} returns 400 (cannot delete yourself)", async () => {
    // The dev bypass identity is test@example.com (from ALLOWED_EMAILS)
    const res = await app.fetch(req("/users/test@example.com", { method: "DELETE" }), env, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Cannot delete yourself");
  });

  it("DELETE /users/{other-email} returns 404 when user does not exist", async () => {
    const res = await app.fetch(req("/users/nobody@example.com", { method: "DELETE" }), env, ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not found");
  });
});
