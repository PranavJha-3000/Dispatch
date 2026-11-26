import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { dispatchDue } from "../src/modules/events/dispatcher.js";
import { api, makeAdmin, makeUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

async function seed() {
  const user = await makeUser();
  const admin = await makeAdmin();
  const t = await api(user.cookie).post("/api/tickets").send({ title: "Boom", description: "It broke", priority: "HIGH" });
  await api(admin.cookie).patch(`/api/tickets/${t.body.id}/status`).send({ status: "RESOLVED" });
  await dispatchDue();
  return { user, admin, ticketId: t.body.id as string };
}

describe("admin guard", () => {
  it("USER gets 403 and anonymous 401 on every admin route", async () => {
    const u = await makeUser();
    for (const [m, url] of [
      ["get", "/api/admin/events"],
      ["get", "/api/admin/events/00000000-0000-0000-0000-000000000000"],
      ["post", "/api/admin/event-deliveries/00000000-0000-0000-0000-000000000000/retry"],
      ["get", "/api/admin/stats"],
    ] as const) {
      expect((await api(u.cookie)[m](url)).status).toBe(403);
      expect((await api()[m](url)).status).toBe(401);
    }
  });
});

describe("events inspector API", () => {
  it("lists newest first with actor and deliveries, filters by type and delivery status", async () => {
    const s = await seed();
    const all = await api(s.admin.cookie).get("/api/admin/events");
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3); // CREATED, STATUS_CHANGED, RESOLVED
    expect(all.body.items[0].type).toBe("TICKET_RESOLVED");
    expect(all.body.items[0].actor.id).toBe(s.admin.user.id);
    expect(all.body.items[0].deliveries).toHaveLength(2);
    const byType = await api(s.admin.cookie).get("/api/admin/events?type=TICKET_CREATED");
    expect(byType.body.items).toHaveLength(1);
    expect((await api(s.admin.cookie).get("/api/admin/events?status=FAILED")).body.total).toBe(0);
    await prisma.eventDelivery.updateMany({ where: { handler: "email" }, data: { status: "FAILED", lastError: "x" } });
    expect((await api(s.admin.cookie).get("/api/admin/events?status=FAILED")).body.total).toBe(3);
  });

  it("returns detail with payload; 404 for unknown or malformed ids", async () => {
    const s = await seed();
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "STATUS_CHANGED" } });
    const res = await api(s.admin.cookie).get(`/api/admin/events/${ev.id}`);
    expect(res.status).toBe(200);
    expect(res.body.payload).toEqual({ from: "OPEN", to: "RESOLVED" });
    expect((await api(s.admin.cookie).get("/api/admin/events/nope")).status).toBe(404);
  });

  it("retries a dead delivery via the API", async () => {
    const s = await seed();
    const d = await prisma.eventDelivery.findFirstOrThrow({ where: { handler: "email" } });
    await prisma.eventDelivery.update({ where: { id: d.id }, data: { status: "DEAD", attempts: 5 } });
    const res = await api(s.admin.cookie).post(`/api/admin/event-deliveries/${d.id}/retry`);
    expect(res.status).toBe(200);
    expect((await prisma.eventDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PENDING");
    expect((await api(s.admin.cookie).post("/api/admin/event-deliveries/nope/retry")).status).toBe(404);
  });
});

describe("ticket activity", () => {
  it("shows the oldest-first timeline to the owner and admin; foreign user gets 404", async () => {
    const s = await seed();
    const other = await makeUser();
    const res = await api(s.user.cookie).get(`/api/tickets/${s.ticketId}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.map((e: { type: string }) => e.type)).toEqual(["TICKET_CREATED", "STATUS_CHANGED", "TICKET_RESOLVED"]);
    expect(res.body[0].actor.name).toBeDefined();
    expect(res.body[0].deliveries).toBeUndefined();
    expect((await api(s.admin.cookie).get(`/api/tickets/${s.ticketId}/activity`)).status).toBe(200);
    expect((await api(other.cookie).get(`/api/tickets/${s.ticketId}/activity`)).status).toBe(404);
  });
});

describe("stats", () => {
  it("aggregates counts, volume, resolution time and failed deliveries", async () => {
    const s = await seed();
    await api(s.user.cookie).post("/api/tickets").send({ title: "Second", description: "d", priority: "LOW" });
    await prisma.eventDelivery.updateMany({ where: { handler: "email" }, data: { status: "DEAD" } });
    const res = await api(s.admin.cookie).get("/api/admin/stats");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.byStatus).toEqual({ OPEN: 1, IN_PROGRESS: 0, RESOLVED: 1, CLOSED: 0 });
    expect(res.body.byPriority).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 1, URGENT: 0 });
    expect(res.body.createdLast7Days).toHaveLength(7);
    expect(res.body.createdLast7Days.at(-1).count).toBe(2);
    expect(res.body.avgResolutionHours).toBeGreaterThanOrEqual(0);
    expect(res.body.failedDeliveries).toBe(4);
  });

  it("avgResolutionHours is null when nothing is resolved", async () => {
    const admin = await makeAdmin();
    expect((await api(admin.cookie).get("/api/admin/stats")).body.avgResolutionHours).toBeNull();
  });
});
