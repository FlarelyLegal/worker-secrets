import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { authenticate } from "../auth.js";

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

describe("authenticate", () => {
  it("DEV_AUTH_BYPASS=true without CF-Connecting-IP returns owner", async () => {
    const request = new Request("http://localhost/secrets", {
      headers: { "Content-Type": "application/json" },
    });
    const user = await authenticate(request, env);
    expect(user).not.toBeNull();
    expect(user?.name).toBe("dev");
    expect(user?.method).toBe("interactive");
    expect(user?.identity).toBe("test@example.com");
    expect(user?.scopes).toEqual(["*"]);
  });

  it("DEV_AUTH_BYPASS=true WITH CF-Connecting-IP returns null (production safeguard)", async () => {
    const request = new Request("http://localhost/secrets", {
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "1.2.3.4",
      },
    });
    const user = await authenticate(request, env);
    // No JWT provided, so after bypass is skipped due to CF-Connecting-IP, it returns null
    expect(user).toBeNull();
  });

  it("missing Cf-Access-Jwt-Assertion returns null", async () => {
    const request = new Request("http://localhost/secrets", {
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "1.2.3.4",
      },
    });
    const user = await authenticate(request, env);
    expect(user).toBeNull();
  });
});
