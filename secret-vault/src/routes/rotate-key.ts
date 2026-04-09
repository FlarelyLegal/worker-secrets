import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { ErrorSchema, R403, R500 } from "../schemas.js";
import * as adminService from "../services/admin.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const rotateKey = new OpenAPIHono<HonoEnv>();

rotateKey.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth)) {
    return c.json({ error: "Admin only" }, 403);
  }
  return next();
});

// --- Rotate key ---
// Intentionally bypasses tag-based access control - must re-wrap ALL DEKs for key rotation.

const rotateKeyRoute = createRoute({
  method: "post",
  path: "/rotate-key",
  tags: ["Admin"],
  summary: "Re-wrap all DEKs with a new master key (admin only)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            new_key: z.string().regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex characters (32 bytes)"),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            ok: z.boolean(),
            rotated: z.number(),
            versions_rotated: z.number(),
            legacy: z.number(),
          }),
        },
      },
      description: "Key rotation results",
    },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
    403: R403,
    500: R500,
  },
});

rotateKey.openapi(rotateKeyRoute, async (c) => {
  const ctx = buildHttpContext(c);
  try {
    const { new_key } = c.req.valid("json");
    const result = await adminService.rotateKey(ctx, new_key);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 500);
    throw e;
  }
});

export default rotateKey;
