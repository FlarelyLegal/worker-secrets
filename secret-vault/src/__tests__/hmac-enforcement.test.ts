import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { computeHmac, verifyHmac } from "../crypto.js";
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
// 1. HMAC tamper detection
// ---------------------------------------------------------------------------
describe("HMAC tamper detection", () => {
  const KEY = "sec-hmac-tamper";

  afterAll(async () => {
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("GET returns 500 with 'Integrity check failed' after DB ciphertext is tampered", async () => {
    // PUT a secret normally
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "tamper-test", description: "hmac tamper" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // Tamper with the ciphertext directly in the DB
    await env.DB.prepare("UPDATE secrets SET value = 'TAMPERED' WHERE key = ?").bind(KEY).run();

    // GET should fail HMAC verification
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(500);
    const body = (await getRes.json()) as { error: string };
    expect(body.error).toContain("Integrity check failed");
  });
});

// ---------------------------------------------------------------------------
// 2. FLAG_HMAC_REQUIRED blocks secrets without HMAC
// ---------------------------------------------------------------------------
describe("FLAG_HMAC_REQUIRED blocks secrets without HMAC", () => {
  const KEY = "sec-no-hmac";

  afterAll(async () => {
    await app.fetch(req("/flags/hmac_required", { method: "DELETE" }), env, ctx);
    await env.DB.prepare("DELETE FROM secrets WHERE key = ?").bind(KEY).run();
  });

  it("GET returns 500 with 'missing HMAC' when hmac_required flag is set", async () => {
    // Insert a secret directly in DB with empty hmac
    await env.DB.prepare(
      "INSERT INTO secrets (key, value, iv, hmac, description, tags, created_by, updated_by) VALUES (?, 'cipher', 'iv123', '', 'no hmac', '', 'test', 'test')",
    )
      .bind(KEY)
      .run();

    // Set hmac_required flag
    await app.fetch(
      req("/flags/hmac_required", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );

    // GET should fail because HMAC is missing
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(500);
    const body = (await getRes.json()) as { error: string };
    expect(body.error).toContain("missing HMAC");
  });
});

// ---------------------------------------------------------------------------
// 3. FLAG_REQUIRE_ENVELOPE_ENCRYPTION blocks legacy secrets
// ---------------------------------------------------------------------------
describe("FLAG_REQUIRE_ENVELOPE_ENCRYPTION blocks legacy secrets", () => {
  const KEY = "sec-legacy-enc";

  afterAll(async () => {
    await app.fetch(req("/flags/require_envelope_encryption", { method: "DELETE" }), env, ctx);
    await env.DB.prepare("DELETE FROM secrets WHERE key = ?").bind(KEY).run();
  });

  it("GET returns 403 for legacy secrets when require_envelope_encryption flag is set", async () => {
    // Insert a secret directly in DB without encrypted_dek/dek_iv (legacy format)
    await env.DB.prepare(
      "INSERT INTO secrets (key, value, iv, hmac, encrypted_dek, dek_iv, description, tags, created_by, updated_by) VALUES (?, 'cipher', 'iv123', 'hmac123', NULL, NULL, 'legacy', '', 'test', 'test')",
    )
      .bind(KEY)
      .run();

    // Set require_envelope_encryption flag
    await app.fetch(
      req("/flags/require_envelope_encryption", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );

    // GET should be rejected because secret uses legacy encryption
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(403);
    const body = (await getRes.json()) as { error: string };
    expect(body.error).toContain("legacy encryption");
  });
});

// ---------------------------------------------------------------------------
// 4. computeHmac + verifyHmac round-trip
// ---------------------------------------------------------------------------
describe("computeHmac + verifyHmac round-trip", () => {
  const TEST_KEY = "aa".repeat(32); // matches vitest.config.mts ENCRYPTION_KEY

  it("verifyHmac returns true for matching values", async () => {
    const hmac = await computeHmac("my-secret", "ciphertext-data", "iv-data", TEST_KEY);
    const valid = await verifyHmac("my-secret", "ciphertext-data", "iv-data", hmac, TEST_KEY);
    expect(valid).toBe(true);
  });

  it("verifyHmac returns false for different ciphertext", async () => {
    const hmac = await computeHmac("my-secret", "ciphertext-data", "iv-data", TEST_KEY);
    const valid = await verifyHmac("my-secret", "DIFFERENT-ciphertext", "iv-data", hmac, TEST_KEY);
    expect(valid).toBe(false);
  });

  it("verifyHmac returns true with envelope fields", async () => {
    const hmac = await computeHmac(
      "my-secret",
      "ciphertext",
      "iv",
      TEST_KEY,
      undefined,
      "enc-dek",
      "dek-iv",
    );
    const valid = await verifyHmac(
      "my-secret",
      "ciphertext",
      "iv",
      hmac,
      TEST_KEY,
      undefined,
      "enc-dek",
      "dek-iv",
    );
    expect(valid).toBe(true);
  });

  it("verifyHmac returns false when envelope fields are tampered", async () => {
    const hmac = await computeHmac(
      "my-secret",
      "ciphertext",
      "iv",
      TEST_KEY,
      undefined,
      "enc-dek",
      "dek-iv",
    );
    const valid = await verifyHmac(
      "my-secret",
      "ciphertext",
      "iv",
      hmac,
      TEST_KEY,
      undefined,
      "TAMPERED-dek",
      "dek-iv",
    );
    expect(valid).toBe(false);
  });
});
