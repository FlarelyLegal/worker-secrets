import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAdmin } from "../auth.js";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { AuditEntrySchema, AuditQuery, ErrorSchema, WhoamiSchema } from "../schemas.js";
import * as adminService from "../services/admin.js";
import type { HonoEnv } from "../types.js";
import { whoamiPage } from "../whoami-page.js";
import { buildHttpContext } from "./context.js";

const admin = new OpenAPIHono<HonoEnv>();

// --- /whoami ---

const whoamiRoute = createRoute({
  method: "get",
  path: "/whoami",
  tags: ["Admin"],
  summary: "Check authentication status",
  responses: {
    200: { content: { "application/json": { schema: WhoamiSchema } }, description: "Auth info" },
  },
});

admin.openapi(whoamiRoute, async (c) => {
  const ctx = buildHttpContext(c);
  const data = await adminService.whoami(ctx);

  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/html")) {
    const brand = c.env.BRAND_NAME || "Secret Vault";
    // biome-ignore lint/suspicious/noExplicitAny: content negotiation returns HTML or JSON
    return c.html(whoamiPage(brand, data)) as any;
  }
  return c.json(data, 200);
});

// --- /audit ---

const auditRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["Admin"],
  summary: "View audit log (admin only)",
  request: { query: AuditQuery },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ entries: z.array(AuditEntrySchema) }) },
      },
      description: "Audit entries",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Owner only",
    },
  },
});

admin.openapi(auditRoute, async (c) => {
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE || !isAdmin(auth))
    return c.json({ error: "Admin only" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const params = c.req.valid("query");
    const result = await adminService.getAuditLog(ctx, params);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

export default admin;
