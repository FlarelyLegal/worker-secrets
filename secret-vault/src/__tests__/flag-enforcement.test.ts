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
// 1. read_only mode blocks PUT but allows GET
// ---------------------------------------------------------------------------
describe("read_only mode blocks PUT but allows GET", () => {
  const KEY = "flag-ro-existing";

  afterAll(async () => {
    // Clean up flag via KV directly (API writes are blocked in read-only mode)
    await env.FLAGS.delete("read_only");
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("blocks PUT and allows GET when read_only is enabled", async () => {
    // Create a secret before enabling read_only
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "ro-test-value", description: "read only test" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // Enable the read_only flag
    const setFlagRes = await app.fetch(
      req("/flags/read_only", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // PUT should be blocked with 503
    const blockedRes = await app.fetch(
      req("/secrets/flag-ro-new-key", {
        method: "PUT",
        body: JSON.stringify({ value: "should-fail" }),
      }),
      env,
      ctx,
    );
    expect(blockedRes.status).toBe(503);

    // GET should still work
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { value: string };
    expect(body.value).toBe("ro-test-value");
  });
});

// ---------------------------------------------------------------------------
// 2. enforce_expiry blocks expired secrets
// ---------------------------------------------------------------------------
describe("enforce_expiry blocks expired secrets", () => {
  const KEY = "flag-expiry-past";

  afterAll(async () => {
    await app.fetch(req("/flags/enforce_expiry", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("returns 403 for expired secrets when enforce_expiry is enabled", async () => {
    // Create a secret with an expiry date in the past
    const putRes = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "expired-value", expires_at: "2020-01-01" }),
      }),
      env,
      ctx,
    );
    expect(putRes.status).toBe(201);

    // Enable enforce_expiry
    const setFlagRes = await app.fetch(
      req("/flags/enforce_expiry", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // GET should return 403 with "expired" in the error
    const getRes = await app.fetch(req(`/secrets/${KEY}`), env, ctx);
    expect(getRes.status).toBe(403);
    const body = (await getRes.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("expired");
  });
});

// ---------------------------------------------------------------------------
// 3. max_secrets limits new secret creation
// ---------------------------------------------------------------------------
describe("max_secrets limits new secret creation", () => {
  const KEY_A = "flag-max-sec-a";
  const KEY_B = "flag-max-sec-b";
  const KEY_C = "flag-max-sec-c";

  afterAll(async () => {
    await app.fetch(req("/flags/max_secrets", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY_A}`, { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY_B}`, { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY_C}`, { method: "DELETE" }), env, ctx);
  });

  it("blocks creation when secret count reaches the limit", async () => {
    // Create 2 secrets
    const putA = await app.fetch(
      req(`/secrets/${KEY_A}`, {
        method: "PUT",
        body: JSON.stringify({ value: "val-a" }),
      }),
      env,
      ctx,
    );
    expect(putA.status).toBe(201);

    const putB = await app.fetch(
      req(`/secrets/${KEY_B}`, {
        method: "PUT",
        body: JSON.stringify({ value: "val-b" }),
      }),
      env,
      ctx,
    );
    expect(putB.status).toBe(201);

    // Count existing secrets to set the limit precisely
    const count = await env.DB.prepare("SELECT COUNT(*) as total FROM secrets").first<{
      total: number;
    }>();
    const currentTotal = count?.total ?? 2;

    // Set max_secrets to the current total (so no new ones can be created)
    const setFlagRes = await app.fetch(
      req("/flags/max_secrets", {
        method: "PUT",
        body: JSON.stringify({ value: currentTotal }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // Third secret should be blocked with 400 containing "limit"
    const putC = await app.fetch(
      req(`/secrets/${KEY_C}`, {
        method: "PUT",
        body: JSON.stringify({ value: "val-c" }),
      }),
      env,
      ctx,
    );
    expect(putC.status).toBe(400);
    const body = (await putC.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("limit");
  });
});

// ---------------------------------------------------------------------------
// 4. require_tags blocks secrets without tags
// ---------------------------------------------------------------------------
describe("require_tags blocks secrets without tags", () => {
  const KEY = "flag-req-tags-test";

  afterAll(async () => {
    await app.fetch(req("/flags/require_tags", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("rejects secrets without tags and allows secrets with tags", async () => {
    // Enable require_tags
    const setFlagRes = await app.fetch(
      req("/flags/require_tags", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // PUT without tags should be rejected with 400
    const putNoTags = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "no-tags-value" }),
      }),
      env,
      ctx,
    );
    expect(putNoTags.status).toBe(400);

    // PUT with tags should succeed with 201
    const putWithTags = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "tagged-value", tags: "ci" }),
      }),
      env,
      ctx,
    );
    expect(putWithTags.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 5. max_tags_per_secret limits tag count
// ---------------------------------------------------------------------------
describe("max_tags_per_secret limits tag count", () => {
  const KEY = "flag-max-tags-test";

  afterAll(async () => {
    await app.fetch(req("/flags/max_tags_per_secret", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("rejects secrets with too many tags and allows within limit", async () => {
    // Set max_tags_per_secret to 2
    const setFlagRes = await app.fetch(
      req("/flags/max_tags_per_secret", {
        method: "PUT",
        body: JSON.stringify({ value: 2 }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // PUT with 3 tags should be rejected with 400
    const putTooMany = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "many-tags", tags: "a,b,c" }),
      }),
      env,
      ctx,
    );
    expect(putTooMany.status).toBe(400);

    // PUT with 2 tags should succeed with 201
    const putOk = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: "two-tags", tags: "a,b" }),
      }),
      env,
      ctx,
    );
    expect(putOk.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 6. max_secret_size_kb limits value size
// ---------------------------------------------------------------------------
describe("max_secret_size_kb limits value size", () => {
  const KEY = "flag-max-size-test";

  afterAll(async () => {
    await app.fetch(req("/flags/max_secret_size_kb", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY}`, { method: "DELETE" }), env, ctx);
  });

  it("rejects oversized values and allows values within limit", async () => {
    // Set max_secret_size_kb to 1 (1KB = 1024 chars)
    const setFlagRes = await app.fetch(
      req("/flags/max_secret_size_kb", {
        method: "PUT",
        body: JSON.stringify({ value: 1 }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // PUT with 2000 characters should be rejected with 400
    const bigValue = "x".repeat(2000);
    const putBig = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: bigValue }),
      }),
      env,
      ctx,
    );
    expect(putBig.status).toBe(400);

    // PUT with 500 characters should succeed with 201
    const smallValue = "x".repeat(500);
    const putSmall = await app.fetch(
      req(`/secrets/${KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: smallValue }),
      }),
      env,
      ctx,
    );
    expect(putSmall.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 7. secret_name_pattern enforces naming
// ---------------------------------------------------------------------------
describe("secret_name_pattern enforces naming", () => {
  const KEY_BAD = "UPPER";
  const KEY_GOOD = "flag-valid-name";

  afterAll(async () => {
    await app.fetch(req("/flags/secret_name_pattern", { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY_BAD}`, { method: "DELETE" }), env, ctx);
    await app.fetch(req(`/secrets/${KEY_GOOD}`, { method: "DELETE" }), env, ctx);
  });

  it("rejects keys not matching the pattern and allows conforming keys", async () => {
    // Set secret_name_pattern to only allow lowercase with hyphens
    const setFlagRes = await app.fetch(
      req("/flags/secret_name_pattern", {
        method: "PUT",
        body: JSON.stringify({ value: "^[a-z][a-z0-9-]+$" }),
      }),
      env,
      ctx,
    );
    expect(setFlagRes.status).toBe(200);

    // PUT with uppercase key should be rejected with 400
    const putBad = await app.fetch(
      req(`/secrets/${KEY_BAD}`, {
        method: "PUT",
        body: JSON.stringify({ value: "bad-name" }),
      }),
      env,
      ctx,
    );
    expect(putBad.status).toBe(400);

    // PUT with valid lowercase-hyphen key should succeed with 201
    const putGood = await app.fetch(
      req(`/secrets/${KEY_GOOD}`, {
        method: "PUT",
        body: JSON.stringify({ value: "good-name" }),
      }),
      env,
      ctx,
    );
    expect(putGood.status).toBe(201);
  });
});
