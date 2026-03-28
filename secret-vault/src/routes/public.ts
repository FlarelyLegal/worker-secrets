import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { healthPage, landingPage } from "../pages.js";
import { HealthSchema } from "../schemas.js";
import type { HonoEnv } from "../types.js";

const pub = new OpenAPIHono<HonoEnv>();

pub.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  const brand = c.env.BRAND_NAME || "Secret Vault";
  return c.html(landingPage(brand, origin));
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
pub.openapi(healthRoute, (c): any => {
  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/html")) {
    const brand = c.env.BRAND_NAME || "Secret Vault";
    return c.html(healthPage(brand));
  }
  return c.json({ status: "ok" }, 200);
});

export default pub;
