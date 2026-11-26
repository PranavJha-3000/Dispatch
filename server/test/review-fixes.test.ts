import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db.js";
import { api, app, makeApp, makeAdmin, makeUser, resetDb } from "./helpers.js";
import { dispatchDue } from "../src/modules/events/dispatcher.js";
import { getStats } from "../src/modules/stats/service.js";

beforeEach(resetDb);
const body = { title: "Cannot log in", description: "Reset email never arrives", category: "ACCOUNT", priority: "HIGH" };
const mk = async (cookie: string) => (await api(cookie).post("/api/tickets").send(body)).body as { id: string };

describe("edit vs concurrent status change", () => {
  it("never lets an owner edit land after the ticket left OPEN", async () => {
    for (let i = 0; i < 8; i++) {
      const { cookie } = await makeUser();
      const admin = await makeAdmin();
      const t = await mk(cookie);
      const [edit, status] = await Promise.all([
        api(cookie).patch(`/api/tickets/${t.id}`).send({ title: `edited ${i}` }),
        api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "IN_PROGRESS" }),
      ]);
      expect(status.status).toBe(200);
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
      // either the edit won (200, title changed) or it lost (409, title untouched); never 200 with a stale view
      if (edit.status === 409) expect(row.title).toBe(body.title);
      else expect(edit.status).toBe(200);
      const upd = await prisma.event.count({ where: { ticketId: t.id, type: "TICKET_UPDATED" } });
      expect(upd).toBe(edit.status === 200 ? 1 : 0);
    }
  });
});

describe("body parser 4xx", () => {
  it("returns 4xx, not 500, for an unsupported charset", async () => {
    const res = await request(app).post("/api/auth/login").set("X-Requested-With", "dispatch")
      .set("Content-Type", "application/json; charset=latin1").send('{"email":"a@b.co","password":"x"}');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("register rate limit", () => {
  it("throttles repeated sign-ups with 429", async () => {
    const limited = makeApp({ registerRateLimit: 2 });
    const reg = (n: number) => api(undefined, limited).post("/api/auth/register").send({ name: "Nora", email: `n${n}@example.com`, password: "password123" });
    expect((await reg(1)).status).toBe(201);
    expect((await reg(2)).status).toBe(201);
    const third = await reg(3);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
  });
  it("login limiter is keyed per account", async () => {
    const limited = makeApp({ loginRateLimit: 2 });
    const bad = (email: string) => api(undefined, limited).post("/api/auth/login").send({ email, password: "wrong-password" });
    await bad("a@example.com"); await bad("a@example.com");
    expect((await bad("a@example.com")).status).toBe(429);
    expect((await bad("b@example.com")).status).toBe(401);
  });
});

describe("resolution time", () => {
  it("keeps resolvedAt when a resolved ticket is closed, so it stays in the average", async () => {
    const { cookie } = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(cookie);
    await api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "RESOLVED" });
    await api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "CLOSED" });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).resolvedAt).not.toBeNull();
    expect((await getStats()).avgResolutionHours).not.toBeNull();
    await api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "OPEN" });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).resolvedAt).toBeNull();
  });
});

describe("admin event payload", () => {
  it("does not expose lease internals", async () => {
    const { cookie } = await makeUser();
    const admin = await makeAdmin();
    await mk(cookie);
    await dispatchDue();
    const res = await api(admin.cookie).get("/api/admin/events");
    const d = res.body.items[0].deliveries[0];
    expect(d).not.toHaveProperty("leaseToken");
    expect(d).not.toHaveProperty("lockedUntil");
    expect(d).toHaveProperty("status");
  });
});
