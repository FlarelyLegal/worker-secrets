import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { authenticate } from "../auth.js";
import { TEST_SCHEMA } from "./setup-db.js";

beforeAll(async () => {
  await env.DB.exec(TEST_SCHEMA);
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
