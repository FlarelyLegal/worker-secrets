import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app, { isSafeWebhookUrl } from "../index.js";
import { esc } from "../pages.js";
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
// 1. isSafeWebhookUrl unit tests
// ---------------------------------------------------------------------------
describe("isSafeWebhookUrl", () => {
  it("blocks https://localhost", () => {
    expect(isSafeWebhookUrl("https://localhost")).toBe(false);
  });

  it("blocks https://127.0.0.1", () => {
    expect(isSafeWebhookUrl("https://127.0.0.1")).toBe(false);
  });

  it("blocks https://10.0.0.1", () => {
    expect(isSafeWebhookUrl("https://10.0.0.1")).toBe(false);
  });

  it("blocks https://172.16.0.1", () => {
    expect(isSafeWebhookUrl("https://172.16.0.1")).toBe(false);
  });

  it("blocks https://192.168.1.1", () => {
    expect(isSafeWebhookUrl("https://192.168.1.1")).toBe(false);
  });

  it("blocks https://169.254.169.254 (AWS metadata)", () => {
    expect(isSafeWebhookUrl("https://169.254.169.254")).toBe(false);
  });

  it("blocks https://[::1]", () => {
    expect(isSafeWebhookUrl("https://[::1]")).toBe(false);
  });

  it("blocks https://intranet (bare hostname, no dot)", () => {
    expect(isSafeWebhookUrl("https://intranet")).toBe(false);
  });

  it("allows https://hooks.example.com/hook", () => {
    expect(isSafeWebhookUrl("https://hooks.example.com/hook")).toBe(true);
  });

  it("allows https://api.slack.com/webhook", () => {
    expect(isSafeWebhookUrl("https://api.slack.com/webhook")).toBe(true);
  });

  it("blocks invalid URL", () => {
    expect(isSafeWebhookUrl("not-a-url")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. esc() HTML escaping
// ---------------------------------------------------------------------------
describe("esc", () => {
  it("escapes single quotes", () => {
    expect(esc("test'value")).toContain("&#39;");
  });

  it("escapes double quotes", () => {
    expect(esc('test"value')).toContain("&quot;");
  });

  it("escapes angle brackets", () => {
    expect(esc("<script>")).toContain("&lt;");
  });

  it("escapes ampersand", () => {
    expect(esc("a&b")).toContain("&amp;");
  });
});

// ---------------------------------------------------------------------------
// 3. Import preserves expires_at
// ---------------------------------------------------------------------------
describe("import preserves expires_at", () => {
  const KEY = "sec-import-expiry";

  afterAll(async () => {
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("POST /secrets/import stores expires_at in the DB row", async () => {
    const res = await app.fetch(
      req("/secrets/import", {
        method: "POST",
        body: JSON.stringify({
          secrets: [{ key: KEY, value: "import-val", expires_at: "2027-06-15" }],
          overwrite: true,
        }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; imported: number };
    expect(body.ok).toBe(true);
    expect(body.imported).toBe(1);

    // Verify the DB row has expires_at set
    const row = await env.DB.prepare("SELECT expires_at FROM secrets WHERE key = ?")
      .bind(KEY)
      .first<{ expires_at: string | null }>();
    expect(row).not.toBeNull();
    expect(row?.expires_at).toBe("2027-06-15");
  });
});

// ---------------------------------------------------------------------------
// 4. Burn-after-reading creates audit entry
// ---------------------------------------------------------------------------
describe("burn-after-reading creates audit entry", () => {
  const KEY = "sec-burn-test";

  afterAll(async () => {
    // Clean up flag
    await app.fetch(req("/flags/burn_after_reading", { method: "DELETE" }), env, ctx);
    // Secret should already be deleted by burn, but clean up just in case
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("GET on burn-tagged secret deletes it and creates audit entries", async () => {
    // Enable burn_after_reading flag
    await app.fetch(
      req("/flags/burn_after_reading", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );

    // Create a secret with tags="burn"
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "burn-me", tags: "burn" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // GET the secret — should succeed and trigger burn
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { value: string };
    expect(body.value).toBe("burn-me");

    // Verify secret is gone
    const get2 = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(get2.status).toBe(404);

    // Check audit_log for both "get" and "delete" actions for that key
    const auditRes = await app.fetch(req(`/audit?key=${KEY}`), env, ctx);
    expect(auditRes.status).toBe(200);
    const auditBody = (await auditRes.json()) as {
      entries: { action: string; secret_key: string }[];
    };
    const actions = auditBody.entries.map((e) => e.action);
    expect(actions).toContain("get");
    expect(actions).toContain("delete");
  });
});

// ---------------------------------------------------------------------------
// 5. Burn-after-reading does NOT trigger on non-burn tags
// ---------------------------------------------------------------------------
describe("burn-after-reading skips non-burn tags", () => {
  const KEY = "sec-no-burn-test";

  afterAll(async () => {
    await app.fetch(req("/flags/burn_after_reading", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("GET on non-burn-tagged secret does NOT delete it", async () => {
    // Enable burn_after_reading flag
    await app.fetch(
      req("/flags/burn_after_reading", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );

    // Create a secret with tags="production" (not "burn")
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "keep-me", tags: "production" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // GET the secret
    const get1 = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(get1.status).toBe(200);

    // GET again — should still return 200 (not deleted)
    const get2 = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(get2.status).toBe(200);
    const body = (await get2.json()) as { value: string };
    expect(body.value).toBe("keep-me");
  });
});

// ---------------------------------------------------------------------------
// 6. Regex pattern NOT reflected in error
// ---------------------------------------------------------------------------
describe("secret name pattern error does not leak regex", () => {
  const KEY = "UPPER_CASE";
  const PATTERN = "^[a-z]+$";

  afterAll(async () => {
    await app.fetch(req("/flags/secret_name_pattern", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("PUT with invalid name returns 400 without revealing the pattern", async () => {
    // Set secret_name_pattern flag
    await app.fetch(
      req("/flags/secret_name_pattern", {
        method: "PUT",
        body: JSON.stringify({ value: PATTERN }),
      }),
      env,
      ctx,
    );

    // PUT a key that doesn't match the pattern
    const res = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "test" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string };
    // Error message should NOT contain the actual regex pattern
    expect(body.error).not.toContain(PATTERN);
    expect(body.error).toContain("naming pattern");
  });
});
