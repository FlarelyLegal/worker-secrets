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
    CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, iv TEXT NOT NULL, description TEXT DEFAULT '', created_by TEXT DEFAULT '', updated_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS service_tokens (client_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', scopes TEXT DEFAULT '*', created_at TEXT DEFAULT (datetime('now')), last_used_at TEXT);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT (datetime('now')), method TEXT NOT NULL, identity TEXT NOT NULL, action TEXT NOT NULL, secret_key TEXT, ip TEXT, user_agent TEXT);
  `);
});

describe("public endpoints", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await app.fetch(req("/health"), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", database: "ok" });
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
