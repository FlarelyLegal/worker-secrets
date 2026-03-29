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
    const result = await authenticate(request, env);
    expect(result).not.toBeNull();
    expect(result?.user.name).toBe("dev");
    expect(result?.user.method).toBe("interactive");
    expect(result?.user.identity).toBe("test@example.com");
    expect(result?.user.scopes).toEqual(["*"]);
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
