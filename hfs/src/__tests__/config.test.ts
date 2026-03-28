import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock `conf` so resolveAuth never touches the real config file on disk.
// The mock store starts empty each test (simulating a fresh install).
vi.mock("conf", () => {
  return {
    default: class FakeConf {
      private store: Record<string, unknown> = {};
      get(key: string) {
        return this.store[key];
      }
      set(key: string, value: unknown) {
        this.store[key] = value;
      }
      delete(key: string) {
        delete this.store[key];
      }
      clear() {
        this.store = {};
      }
      get path() {
        return "/tmp/fake-hfs-config.json";
      }
    },
  };
});

describe("resolveAuth", () => {
  beforeEach(() => {
    delete process.env.HFS_URL;
    delete process.env.HFS_CLIENT_ID;
    delete process.env.HFS_CLIENT_SECRET;
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
    vi.resetModules();
  });

  it("throws when no URL configured", async () => {
    const { resolveAuth } = await import("../config.js");
    expect(() => resolveAuth()).toThrow("Vault URL not configured");
  });

  it("returns service_token when both env vars set", async () => {
    process.env.HFS_URL = "https://vault.example.com";
    process.env.HFS_CLIENT_ID = "abc.access";
    process.env.HFS_CLIENT_SECRET = "secret";
    const { resolveAuth } = await import("../config.js");
    const auth = resolveAuth();
    expect(auth.type).toBe("service_token");
    if (auth.type === "service_token") {
      expect(auth.clientId).toBe("abc.access");
      expect(auth.clientSecret).toBe("secret");
      expect(auth.url).toBe("https://vault.example.com");
    }
  });

  it("throws on partial service token config (only ID)", async () => {
    process.env.HFS_URL = "https://vault.example.com";
    process.env.HFS_CLIENT_ID = "abc.access";
    const { resolveAuth } = await import("../config.js");
    expect(() => resolveAuth()).toThrow("Incomplete service token config");
  });

  it("throws on partial service token config (only secret)", async () => {
    process.env.HFS_URL = "https://vault.example.com";
    process.env.HFS_CLIENT_SECRET = "secret";
    const { resolveAuth } = await import("../config.js");
    expect(() => resolveAuth()).toThrow("Incomplete service token config");
  });

  it("also recognizes CF_ACCESS_ prefixed env vars", async () => {
    process.env.HFS_URL = "https://vault.example.com";
    process.env.CF_ACCESS_CLIENT_ID = "cf.access";
    process.env.CF_ACCESS_CLIENT_SECRET = "cf-secret";
    const { resolveAuth } = await import("../config.js");
    const auth = resolveAuth();
    expect(auth.type).toBe("service_token");
    if (auth.type === "service_token") {
      expect(auth.clientId).toBe("cf.access");
      expect(auth.clientSecret).toBe("cf-secret");
    }
  });
});
