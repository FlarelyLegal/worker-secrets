import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { hasScope } from "../auth.js";
import { SCOPE_READ } from "../constants.js";
import { R403 } from "../schemas.js";
import type { HonoEnv } from "../types.js";

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

type UserRow = {
  email: string;
  name: string;
  role: string;
  age_public_key: string;
};
type RoleRow = { allowed_tags: string };

recipients.openapi(recipientsRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const { tags } = c.req.valid("query");

  // Fetch all enabled users with age public keys
  const { results } = await c.env.DB.prepare(
    "SELECT email, name, role, age_public_key FROM users WHERE enabled = 1 AND age_public_key IS NOT NULL",
  ).all();

  let eligible = results as UserRow[];

  // If tags specified, filter to users whose roles grant access to those tags
  if (tags) {
    const secretTags = tags.split(",").map((t) => t.trim());
    const filtered: UserRow[] = [];
    for (const user of eligible) {
      const role = await c.env.DB.prepare("SELECT allowed_tags FROM roles WHERE name = ?")
        .bind(user.role)
        .first<RoleRow>();
      if (!role) continue;
      // Empty allowed_tags = access to everything
      if (!role.allowed_tags) {
        filtered.push(user);
        continue;
      }
      const roleTags = role.allowed_tags.split(",").map((t) => t.trim());
      if (secretTags.some((t) => roleTags.includes(t))) {
        filtered.push(user);
      }
    }
    eligible = filtered;
  }

  return c.json(
    {
      recipients: eligible.map((u) => ({
        email: u.email,
        name: u.name,
        age_public_key: u.age_public_key,
      })),
    },
    200,
  );
});

export default recipients;
