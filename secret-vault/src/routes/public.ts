import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { healthPage, landingPage } from "../pages.js";
import { HealthSchema } from "../schemas.js";
import type { HonoEnv } from "../types.js";

const pub = new OpenAPIHono<HonoEnv>();

pub.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  const brand = c.env.BRAND_NAME || "Secret Vault";
  const repoUrl = c.env.REPO_URL;
  const pkg = c.env.PROJECT_NAME ? `${c.env.PROJECT_NAME}-cli` : undefined;
  return c.html(landingPage(brand, origin, repoUrl, pkg));
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Public"],
  summary: "Health check (no auth required)",
  responses: {
    200: {
      content: { "application/json": { schema: HealthSchema } },
      description: "Service is healthy",
    },
  },
});

// biome-ignore lint/suspicious/noExplicitAny: content negotiation returns HTML or JSON
pub.openapi(healthRoute, async (c): Promise<any> => {
  // Verify D1 is reachable
  let dbOk = true;
  try {
    await c.env.DB.prepare("SELECT 1").run();
  } catch {
    dbOk = false;
  }

  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/html")) {
    const brand = c.env.BRAND_NAME || "Secret Vault";
    return c.html(healthPage(brand, dbOk));
  }
  return c.json(
    { status: dbOk ? "ok" : "degraded", database: dbOk ? "ok" : "unreachable" },
    dbOk ? 200 : 503,
  );
});

export default pub;
