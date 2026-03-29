import { OpenAPIHono } from "@hono/zod-openapi";
import type { HonoEnv } from "../types.js";
import bulkExport from "./bulk-export.js";
import bulkImport from "./bulk-import.js";

const bulk = new OpenAPIHono<HonoEnv>();

bulk.route("/", bulkExport);
bulk.route("/", bulkImport);

export default bulk;
