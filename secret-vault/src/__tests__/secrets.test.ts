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

describe("secrets CRUD", () => {
  it("PUT /secrets/test-key creates a secret and returns 201", async () => {
    const res = await app.fetch(
      req("/secrets/test-key", {
        method: "PUT",
        body: JSON.stringify({ value: "hello", description: "test" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true, key: "test-key" });
  });

  it("GET /secrets/test-key returns the decrypted value", async () => {
    const res = await app.fetch(req("/secrets/test-key"), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.key).toBe("test-key");
    expect(body.value).toBe("hello");
    expect(body.description).toBe("test");
  });

  it("GET /secrets returns list with total", async () => {
    const res = await app.fetch(req("/secrets"), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("secrets");
    expect(body).toHaveProperty("total");
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("DELETE /secrets/test-key returns 200", async () => {
    const res = await app.fetch(req("/secrets/test-key", { method: "DELETE" }), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true, deleted: "test-key" });
  });

  it("GET /secrets/test-key after delete returns 404", async () => {
    const res = await app.fetch(req("/secrets/test-key"), env, ctx);
    expect(res.status).toBe(404);
  });
});

describe("secrets validation", () => {
  it("PUT /secrets/export (reserved key) returns 400", async () => {
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

  it("PUT /secrets/import (reserved key) returns 400", async () => {
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

  it("PUT without value returns 400", async () => {
    const res = await app.fetch(
      req("/secrets/no-val", {
        method: "PUT",
        body: JSON.stringify({ description: "missing value" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("value exceeding 1MB limit returns 400", async () => {
    const bigValue = "x".repeat(1_000_001);
    const res = await app.fetch(
      req("/secrets/big-key", {
        method: "PUT",
        body: JSON.stringify({ value: bigValue }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });
});
