import type { Context } from "hono";
import { audit } from "../auth.js";
import type { ServiceContext } from "../services/types.js";
import type { HonoEnv } from "../types.js";

export function buildHttpContext(c: Context<HonoEnv>): ServiceContext {
  const auth = c.get("auth");
  const ip = c.get("ip");
  const ua = c.get("ua");
  const requestId = c.get("requestId");
  return {
    db: c.env.DB,
    kv: c.env.FLAGS,
    env: c.env,
    auth,
    flagCache: c.get("flags"),
    requestId,
    auditFn: (action: string, key: string | null) =>
      audit(c.env, auth, action, key, ip, ua, requestId),
    waitUntil: (p: Promise<unknown>) => c.executionCtx.waitUntil(p),
  };
}
