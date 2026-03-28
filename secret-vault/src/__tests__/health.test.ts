import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../index.js";

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
    CREATE TABLE IF NOT EXISTS roles (name TEXT PRIMARY KEY, scopes TEXT NOT NULL, description TEXT DEFAULT '', created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_by TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_by TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (role) REFERENCES roles(name));
    INSERT OR IGNORE INTO roles (name, scopes, description, created_by) VALUES ('admin', '*', 'Full access', 'system');
  `);
});

describe("public endpoints", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await app.fetch(req("/health"), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", database: "ok", kv: "ok" });
  });

  it("GET / returns 200 with HTML content-type", async () => {
    const res = await app.fetch(req("/"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("GET /doc returns 200 with HTML", async () => {
    const res = await app.fetch(req("/doc"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("GET /doc/json returns 200 with valid OpenAPI JSON", async () => {
    const res = await app.fetch(req("/doc/json"), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("openapi", "3.0.0");
    expect(body).toHaveProperty("info");
    expect(body).toHaveProperty("paths");
  });
});
