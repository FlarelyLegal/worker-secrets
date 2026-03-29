import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../index.js";
import { TEST_SCHEMA } from "./setup-db.js";

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

beforeAll(async () => {
  await env.DB.exec(TEST_SCHEMA);
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
