import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { AUTH_INTERACTIVE } from "../constants.js";
import { VaultError } from "../errors.js";
import { R403 } from "../schemas.js";
import { SecretExportItemSchema } from "../schemas-secrets.js";
import * as bulkService from "../services/bulk.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const bulkExport = new OpenAPIHono<HonoEnv>();

const exportRoute = createRoute({
  method: "get",
  path: "/export",
  tags: ["Secrets"],
  summary: "Export all secrets decrypted (interactive only)",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ secrets: z.array(SecretExportItemSchema) }) },
      },
      description: "All secrets decrypted",
    },
    403: R403,
  },
});

bulkExport.openapi(exportRoute, async (c) => {
  // Interactive-only guard stays in HTTP layer (RPC callers bypass this)
  const auth = c.get("auth");
  if (auth.method !== AUTH_INTERACTIVE) return c.json({ error: "Owner only" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const result = await bulkService.exportSecrets(ctx);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

export default bulkExport;
