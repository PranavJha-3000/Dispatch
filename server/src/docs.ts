import { readFileSync } from "node:fs";
import swaggerUi from "swagger-ui-express";
import { parse } from "yaml";
import type { Router } from "express";
import { Router as makeRouter } from "express";

// docs/ sits two levels above both src/ and dist/.
const specUrl = new URL("../../docs/openapi.yaml", import.meta.url);

export function docsRoutes(): Router {
  const router = makeRouter();
  const spec = parse(readFileSync(specUrl, "utf8"));
  router.use("/", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Dispatch API" }));
  return router;
}
