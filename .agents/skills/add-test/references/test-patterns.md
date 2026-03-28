# Test patterns

## Worker integration tests

```typescript
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index";

// Helper to make authenticated requests
function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // Mock Cf-Access-Jwt-Assertion for testing
      // In real tests, you'd need to sign a valid JWT or bypass auth
      ...options.headers,
    },
  });
}

describe("health", () => {
  it("returns ok without auth", async () => {
    const res = await app.fetch(makeRequest("/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });
});

describe("secrets CRUD", () => {
  // Note: These need auth mocking/bypass for local testing

  it("returns 401 without auth header", async () => {
    const res = await app.fetch(makeRequest("/secrets"), env);
    expect(res.status).toBe(401);
  });

  // With auth bypass for testing:
  it("creates and retrieves a secret", async () => {
    const put = await app.fetch(
      makeRequest("/secrets/test-key", {
        method: "PUT",
        body: JSON.stringify({ value: "secret-value", description: "test" }),
      }),
      env
    );
    expect(put.status).toBe(201);

    const get = await app.fetch(makeRequest("/secrets/test-key"), env);
    const data = await get.json();
    expect(data.value).toBe("secret-value");
    expect(data.description).toBe("test");
  });
});
```

## Crypto unit tests

```typescript
import { describe, it, expect } from "vitest";

// Import or inline the crypto functions for testing
describe("encrypt/decrypt", () => {
  const testKey = "a]".repeat(32); // 64-char hex = 32 bytes

  it("round-trips plaintext", async () => {
    const { ciphertext, iv } = await encrypt("hello world", testKey);
    const result = await decrypt(ciphertext, iv, testKey);
    expect(result).toBe("hello world");
  });

  it("produces different IVs each time", async () => {
    const a = await encrypt("same", testKey);
    const b = await encrypt("same", testKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails with wrong key", async () => {
    const { ciphertext, iv } = await encrypt("hello", testKey);
    const wrongKey = "b".repeat(64);
    await expect(decrypt(ciphertext, iv, wrongKey)).rejects.toThrow();
  });

  it("handles empty string", async () => {
    const { ciphertext, iv } = await encrypt("", testKey);
    const result = await decrypt(ciphertext, iv, testKey);
    expect(result).toBe("");
  });

  it("handles unicode", async () => {
    const { ciphertext, iv } = await encrypt("🔐 secret émojis", testKey);
    const result = await decrypt(ciphertext, iv, testKey);
    expect(result).toBe("🔐 secret émojis");
  });
});
```

## CLI unit tests

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAuth } from "../src/config";

describe("resolveAuth", () => {
  beforeEach(() => {
    // Clear env vars between tests
    delete process.env.HFS_URL;
    delete process.env.HFS_CLIENT_ID;
    delete process.env.HFS_CLIENT_SECRET;
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
  });

  it("throws when no URL configured", () => {
    expect(() => resolveAuth()).toThrow("Vault URL not configured");
  });

  it("returns service_token when both env vars set", () => {
    process.env.HFS_URL = "https://vault.example.com";
    process.env.HFS_CLIENT_ID = "abc.access";
    process.env.HFS_CLIENT_SECRET = "secret";

    const auth = resolveAuth();
    expect(auth.type).toBe("service_token");
  });

  it("throws on partial service token env vars", () => {
    process.env.HFS_URL = "https://vault.example.com";
    process.env.HFS_CLIENT_ID = "abc.access";
    // HFS_CLIENT_SECRET not set

    expect(() => resolveAuth()).toThrow("Incomplete service token config");
  });
});
```

## Scope enforcement tests

```typescript
describe("scope enforcement", () => {
  it("read-only token cannot write", async () => {
    // Register token with read scope, then try PUT /secrets/:key
    const res = await authenticatedFetch("/secrets/test", {
      method: "PUT",
      body: JSON.stringify({ value: "nope" }),
      token: readOnlyToken,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Insufficient scope");
  });

  it("read-only token cannot delete", async () => {
    const res = await authenticatedFetch("/secrets/test", {
      method: "DELETE",
      token: readOnlyToken,
    });
    expect(res.status).toBe(403);
  });

  it("wildcard token can do everything", async () => {
    // Token with "*" scope
    const put = await authenticatedFetch("/secrets/test", {
      method: "PUT",
      body: JSON.stringify({ value: "yes" }),
      token: wildcardToken,
    });
    expect(put.status).toBe(201);
  });
});
```
