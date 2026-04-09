import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { R403, R500 } from "../schemas.js";
import * as adminService from "../services/admin.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const adminOps = new OpenAPIHono<HonoEnv>();

// Admin-only middleware
adminOps.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

// --- Re-encrypt ---
// Migrates legacy (direct-encrypted) secrets to envelope encryption.
// Intentionally bypasses tag-based access control - must process ALL secrets to complete migration.

const reencryptRoute = createRoute({
  method: "post",
  path: "/re-encrypt",
  tags: ["Admin"],
  summary: "Re-encrypt legacy secrets with envelope encryption (admin only)",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean(), migrated: z.number(), skipped: z.number() }),
        },
      },
      description: "Re-encryption results",
    },
    403: R403,
    500: R500,
  },
});

adminOps.openapi(reencryptRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const result = await adminService.reEncrypt(ctx);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 500);
    throw e;
  }
});

export default adminOps;
