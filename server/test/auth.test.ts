import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { api, app, cookieFor, makeApp, makeAdmin, makeUser, resetDb } from "./helpers.js";
import { prisma } from "../src/db.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

const creds = { name: "Ada", email: "ada@example.com", password: "password123" };

beforeEach(resetDb);

describe("register", () => {
  it("creates a USER and never leaks the hash", async () => {
    const res = await api().post("/api/auth/register").send(creds);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), name: "Ada", email: "ada@example.com", role: "USER" });
  });

  it("ignores a client-supplied role", async () => {
    const res = await api().post("/api/auth/register").send({ ...creds, role: "ADMIN" });
    expect(res.status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    expect(row.role).toBe("USER");
  });

  it("treats emails case/whitespace-insensitively (duplicate -> 409) and login works in any case", async () => {
    await api().post("/api/auth/register").send(creds);
    const dup = await api().post("/api/auth/register").send({ ...creds, email: " ADA@example.com " });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");
    const login = await api().post("/api/auth/login").send({ email: "ADA@Example.com", password: "password123" });
    expect(login.status).toBe(200);
  });

  it("validates input", async () => {
    const bad = await api().post("/api/auth/register").send({ name: "A", email: "nope", password: "short" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("login / session", () => {
  it("returns identical 401 for wrong password and unknown email", async () => {
    await api().post("/api/auth/register").send(creds);
    const wrong = await api().post("/api/auth/login").send({ email: creds.email, password: "wrong-password" });
    const unknown = await api().post("/api/auth/login").send({ email: "who@example.com", password: "password123" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("sets an httpOnly SameSite=Lax cookie that authenticates /me; logout clears it", async () => {
    await api().post("/api/auth/register").send(creds);
    const login = await api().post("/api/auth/login").send({ email: creds.email, password: creds.password });
    const setCookie = (login.headers["set-cookie"] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/dispatch_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const me = await api(setCookie.split(";")[0]).get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(creds.email);
    const out = await api(setCookie.split(";")[0]).post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect((out.headers["set-cookie"] as unknown as string[])[0]).toMatch(/dispatch_token=;/);
  });

  it("rejects missing, tampered, expired and deleted-user tokens with 401", async () => {
    const { user, cookie } = await makeUser();
    expect((await api().get("/api/auth/me")).status).toBe(401);
    expect((await api(cookie + "x").get("/api/auth/me")).status).toBe(401);
    expect((await api(cookieFor(user.id, "USER", { expiresIn: -10 })).get("/api/auth/me")).status).toBe(401);
    await prisma.user.delete({ where: { id: user.id } });
    expect((await api(cookie).get("/api/auth/me")).status).toBe(401);
  });

  it("uses the role in the database, not the token", async () => {
    const { user } = await makeUser("USER");
    const forged = cookieFor(user.id, "ADMIN");
    const probe = express();
    probe.use(cookieParser());
    probe.get("/admin", requireAuth, requireRole("ADMIN"), (_q, r) => void r.json({ ok: true }));
    probe.use(errorHandler);
    expect((await request(probe).get("/admin").set("Cookie", forged)).status).toBe(403);
  });

  it("rate-limits repeated failed logins", async () => {
    const limited = makeApp({ loginRateLimit: 3 });
    let last = 0;
    for (let i = 0; i < 5; i++) {
      last = (await api(undefined, limited).post("/api/auth/login").send({ email: "x@example.com", password: "nope-nope" })).status;
    }
    expect(last).toBe(429);
  });
});

describe("role guard", () => {
  it("USER -> 403, ADMIN -> 200, anonymous -> 401", async () => {
    const probe = express();
    probe.use(cookieParser());
    probe.get("/admin", requireAuth, requireRole("ADMIN"), (_q, r) => void r.json({ ok: true }));
    probe.use(errorHandler);
    const u = await makeUser();
    const a = await makeAdmin();
    expect((await request(probe).get("/admin").set("Cookie", u.cookie)).status).toBe(403);
    expect((await request(probe).get("/admin").set("Cookie", a.cookie)).status).toBe(200);
    expect((await request(probe).get("/admin")).status).toBe(401);
  });
});

void app;
