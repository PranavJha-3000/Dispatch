import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, api } from "./helpers.js";

describe("foundation", () => {
  it("GET /api/health returns ok", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("unknown route returns 404 with the error shape", async () => {
    const res = await api().get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("malformed JSON returns 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("X-Requested-With", "dispatch")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("csrf guard", () => {
  it("rejects state-changing requests without the custom header", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a foreign Origin even with the header", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "dispatch")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(403);
  });

  it("allows GET without the header", async () => {
    expect((await request(app).get("/api/health")).status).toBe(200);
  });
});
