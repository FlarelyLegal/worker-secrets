import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { hasScope } from "../auth.js";
import { SCOPE_READ } from "../constants.js";
import { VaultError } from "../errors.js";
import { R403 } from "../schemas.js";
import * as recipientsService from "../services/recipients.js";
import type { HonoEnv } from "../types.js";
import { buildHttpContext } from "./context.js";

const recipients = new OpenAPIHono<HonoEnv>();

const RecipientSchema = z.object({
  email: z.string(),
  name: z.string(),
  age_public_key: z.string(),
});

const recipientsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Users"],
  summary: "List users with age public keys (for e2e encryption)",
  request: {
    query: z.object({
      tags: z
        .string()
        .optional()
        .openapi({ param: { name: "tags", in: "query" }, example: "production" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ recipients: z.array(RecipientSchema) }) },
      },
      description: "Users with registered age public keys who can access the given tags",
    },
    403: R403,
  },
});

recipients.openapi(recipientsRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const ctx = buildHttpContext(c);
  try {
    const { tags } = c.req.valid("query");
    const result = await recipientsService.getRecipients(ctx, { tags });
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof VaultError) return c.json({ error: e.message }, e.status as 403);
    throw e;
  }
});

export default recipients;
