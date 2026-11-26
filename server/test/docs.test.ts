import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import SwaggerParser from "@apidevtools/swagger-parser";
import { parse } from "yaml";
import request from "supertest";
import { app } from "./helpers.js";

const specPath = new URL("../../docs/openapi.yaml", import.meta.url);

// Every implemented route must be documented. Keep in sync when adding routes.
const IMPLEMENTED = [
  "get /api/health", "post /api/auth/register", "post /api/auth/login", "post /api/auth/logout", "get /api/auth/me",
  "get /api/tickets", "post /api/tickets", "get /api/tickets/{id}", "patch /api/tickets/{id}", "delete /api/tickets/{id}",
  "patch /api/tickets/{id}/status", "get /api/tickets/{id}/comments", "post /api/tickets/{id}/comments",
  "get /api/tickets/{id}/activity", "get /api/notifications", "post /api/notifications/read-all",
  "patch /api/notifications/{id}/read", "get /api/admin/events", "get /api/admin/events/{id}",
  "post /api/admin/event-deliveries/{id}/retry", "get /api/admin/stats",
];

describe("API docs", () => {
  it("OpenAPI spec is valid", async () => {
    await expect(SwaggerParser.validate(specPath.pathname.replace(/^\/([A-Za-z]:)/, "$1"))).resolves.toBeTruthy();
  });

  it("documents every implemented route", () => {
    const spec = parse(readFileSync(specPath, "utf8"));
    const documented = Object.entries(spec.paths).flatMap(([p, ops]) =>
      Object.keys(ops as object).filter((k) => ["get", "post", "patch", "put", "delete"].includes(k)).map((m) => `${m} ${p}`),
    );
    expect(documented.sort()).toEqual([...IMPLEMENTED].sort());
  });

  it("serves Swagger UI at /api/docs", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });
});
