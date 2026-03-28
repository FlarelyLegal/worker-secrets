import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../index.js";

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
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, iv TEXT NOT NULL, hmac TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', tags TEXT DEFAULT '', created_by TEXT DEFAULT '', updated_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS service_tokens (client_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', scopes TEXT DEFAULT '*', role TEXT, created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), last_used_at TEXT);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT (datetime('now')), method TEXT NOT NULL, identity TEXT NOT NULL, action TEXT NOT NULL, secret_key TEXT, ip TEXT, user_agent TEXT, request_id TEXT);
    CREATE TABLE IF NOT EXISTS secret_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, secret_key TEXT NOT NULL, value TEXT NOT NULL, iv TEXT NOT NULL, hmac TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', changed_by TEXT DEFAULT '', changed_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (secret_key) REFERENCES secrets(key) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS roles (name TEXT PRIMARY KEY, scopes TEXT NOT NULL, description TEXT DEFAULT '', created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_by TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_by TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (role) REFERENCES roles(name));
    INSERT OR IGNORE INTO roles (name, scopes, description, created_by) VALUES ('admin', '*', 'Full access', 'system');
  `);
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
