import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { audit, hasScope, hasTagAccess } from "../auth.js";
import {
  ACTION_DELETE,
  ACTION_GET,
  ACTION_LIST,
  FLAG_BURN_AFTER_READING,
  FLAG_ENFORCE_EXPIRY,
  FLAG_HMAC_REQUIRED,
  FLAG_REQUIRE_ENVELOPE_ENCRYPTION,
  SCOPE_DELETE,
  SCOPE_READ,
} from "../constants.js";
import { decrypt, envelopeDecrypt, verifyHmac } from "../crypto.js";
import { getFlag } from "../flags.js";
import { ErrorSchema, PaginationQuery, R403, R500 } from "../schemas.js";
import {
  KeyParam,
  SecretDeleteResponse,
  SecretEntrySchema,
  SecretListItemSchema,
  type SecretRow,
} from "../schemas-secrets.js";
import type { HonoEnv } from "../types.js";

const secrets = new OpenAPIHono<HonoEnv>();

// --- List ---
const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Secrets"],
  summary: "List secret keys (no values)",
  request: { query: PaginationQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            secrets: z.array(SecretListItemSchema),
            total: z.number(),
          }),
        },
      },
      description: "Paginated list of secrets",
    },
    403: R403,
  },
});

secrets.openapi(listRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const { limit, offset, search } = c.req.valid("query");
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (search) {
    // Escape SQL LIKE wildcards in user input
    const escaped = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push("key LIKE ? ESCAPE '\\'");
    binds.push(`%${escaped}%`);
  }

  // Tag-based access control: filter in SQL for correct pagination
  if (auth.allowedTags.length > 0) {
    const tagConditions = auth.allowedTags.map(() => "',' || tags || ',' LIKE ?").join(" OR ");
    conditions.push(`(${tagConditions})`);
    for (const tag of auth.allowedTags) {
      binds.push(`%,${tag},%`);
    }
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*) as total FROM secrets${where}`;
  const listSql = `SELECT key, description, tags, expires_at, created_by, updated_by, created_at, updated_at FROM secrets${where} ORDER BY key LIMIT ? OFFSET ?`;

  const { results: countResult } = await c.env.DB.prepare(countSql)
    .bind(...binds)
    .all();
  const dbTotal = (countResult[0] as { total: number }).total;
  const { results } = await c.env.DB.prepare(listSql)
    .bind(...binds, limit, offset)
    .all();

  await audit(c.env, auth, ACTION_LIST, null, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json(
    {
      secrets: results as z.infer<typeof SecretListItemSchema>[],
      total: dbTotal,
    },
    200,
  );
});

// --- Get ---
const getRoute = createRoute({
  method: "get",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Get a decrypted secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: { "application/json": { schema: SecretEntrySchema } },
      description: "Decrypted secret",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    500: R500,
  },
});

secrets.openapi(getRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_READ)) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");
  const row = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
    .bind(key)
    .first<SecretRow>();

  if (!row) return c.json({ error: "Secret not found" }, 404);

  // Tag-based access control
  if (!hasTagAccess(auth, row.tags))
    return c.json({ error: "Access denied — secret tags do not match your role" }, 403);

  // Enforce expiry
  if (row.expires_at) {
    const enforceExpiry = getFlag(c.get("flags"), FLAG_ENFORCE_EXPIRY, false);
    if (enforceExpiry && new Date(row.expires_at).getTime() < Date.now())
      return c.json({ error: `Secret expired at ${row.expires_at} — rotate or re-set it` }, 403);
  }

  // Require envelope encryption
  if (!row.encrypted_dek || !row.dek_iv) {
    const requireEnvelope = getFlag(c.get("flags"), FLAG_REQUIRE_ENVELOPE_ENCRYPTION, false);
    if (requireEnvelope)
      return c.json(
        { error: "Secret uses legacy encryption — run `hfs re-encrypt` to migrate" },
        403,
      );
  }

  // Verify HMAC integrity
  if (row.hmac) {
    const valid = await verifyHmac(
      key,
      row.value,
      row.iv,
      row.hmac,
      c.env.ENCRYPTION_KEY,
      c.env.INTEGRITY_KEY,
      row.encrypted_dek,
      row.dek_iv,
    );
    if (!valid)
      return c.json({ error: "Integrity check failed — secret may have been tampered with" }, 500);
  } else {
    const hmacRequired = getFlag(c.get("flags"), FLAG_HMAC_REQUIRED, false);
    if (hmacRequired)
      return c.json({ error: "Secret missing HMAC integrity tag — re-save to add one" }, 500);
  }

  // Decrypt: envelope (DEK) or legacy (direct)
  let plaintext: string;
  try {
    if (row.encrypted_dek && row.dek_iv) {
      plaintext = await envelopeDecrypt(
        row.value,
        row.iv,
        row.encrypted_dek,
        row.dek_iv,
        c.env.ENCRYPTION_KEY,
      );
    } else {
      plaintext = await decrypt(row.value, row.iv, c.env.ENCRYPTION_KEY);
    }
  } catch {
    return c.json({ error: "Decryption failed" }, 500);
  }
  await audit(c.env, auth, ACTION_GET, key, c.get("ip"), c.get("ua"), c.get("requestId"));

  // Burn after reading: delete secret after successful read if tagged "burn" and flag enabled
  const burnEnabled = getFlag(c.get("flags"), FLAG_BURN_AFTER_READING, false);
  if (burnEnabled && row.tags?.split(",").some((t) => t.trim() === "burn")) {
    await c.env.DB.prepare("DELETE FROM secrets WHERE key = ?").bind(key).run();
  }

  const {
    key: k,
    description,
    tags,
    expires_at,
    created_by,
    updated_by,
    created_at,
    updated_at,
  } = row;
  return c.json(
    {
      key: k,
      value: plaintext,
      description,
      tags,
      expires_at,
      created_by,
      updated_by,
      created_at,
      updated_at,
    },
    200,
  );
});

// --- Delete ---

const deleteRoute = createRoute({
  method: "delete",
  path: "/{key}",
  tags: ["Secrets"],
  summary: "Delete a secret",
  request: { params: KeyParam },
  responses: {
    200: {
      content: { "application/json": { schema: SecretDeleteResponse } },
      description: "Deleted",
    },
    403: R403,
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

secrets.openapi(deleteRoute, async (c) => {
  const auth = c.get("auth");
  if (!hasScope(auth, SCOPE_DELETE)) return c.json({ error: "Insufficient scope" }, 403);

  const { key } = c.req.valid("param");

  // Check tag access before deleting
  const row = await c.env.DB.prepare("SELECT tags FROM secrets WHERE key = ?")
    .bind(key)
    .first<{ tags: string }>();
  if (!row) return c.json({ error: "Secret not found" }, 404);
  if (!hasTagAccess(auth, row.tags))
    return c.json({ error: "Access denied — secret tags do not match your role" }, 403);

  // Delete versions first (explicit cleanup — FK CASCADE may not be enforced in D1)
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM secret_versions WHERE secret_key = ?").bind(key),
    c.env.DB.prepare("DELETE FROM secrets WHERE key = ?").bind(key),
  ]);
  await audit(c.env, auth, ACTION_DELETE, key, c.get("ip"), c.get("ua"), c.get("requestId"));
  return c.json({ ok: true, deleted: key }, 200);
});

export default secrets;
