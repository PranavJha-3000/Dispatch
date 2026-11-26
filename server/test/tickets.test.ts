import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, makeAdmin, makeUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

const body = { title: "Cannot log in", description: "Reset email never arrives", category: "ACCOUNT", priority: "HIGH" };

async function mk(cookie: string, over: Record<string, unknown> = {}) {
  const res = await api(cookie).post("/api/tickets").send({ ...body, ...over });
  expect(res.status).toBe(201);
  return res.body as { id: string; status: string };
}
const events = (type?: string) => prisma.event.findMany({ where: type ? { type: type as never } : {}, orderBy: { seq: "asc" } });

describe("create", () => {
  it("creates an OPEN ticket and records TICKET_CREATED with deliveries", async () => {
    const { user, cookie } = await makeUser();
    const t = await mk(cookie);
    expect(t.status).toBe("OPEN");
    const evs = await events("TICKET_CREATED");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.actorId).toBe(user.id);
    expect(evs[0]!.ticketId).toBe(t.id);
    expect(await prisma.eventDelivery.count({ where: { eventId: evs[0]!.id, status: "PENDING" } })).toBe(2);
  });

  it("rejects whitespace-only and oversize input", async () => {
    const { cookie } = await makeUser();
    expect((await api(cookie).post("/api/tickets").send({ ...body, title: "   " })).status).toBe(400);
    expect((await api(cookie).post("/api/tickets").send({ ...body, title: "x".repeat(121) })).status).toBe(400);
    expect((await api(cookie).post("/api/tickets").send({ ...body, description: "x".repeat(5001) })).status).toBe(400);
    expect((await api(cookie).post("/api/tickets").send({ ...body, priority: "NOPE" })).status).toBe(400);
  });

  it("requires authentication", async () => {
    expect((await api().post("/api/tickets").send(body)).status).toBe(401);
  });
});

describe("list / filters", () => {
  it("scopes users to their own tickets and admins to all", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const admin = await makeAdmin();
    await mk(a.cookie);
    await mk(b.cookie);
    expect((await api(a.cookie).get("/api/tickets")).body.total).toBe(1);
    expect((await api(admin.cookie).get("/api/tickets")).body.total).toBe(2);
  });

  it("filters by status, priority and search; paginates and sorts", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t1 = await mk(u.cookie, { title: "Refund please", priority: "LOW" });
    await mk(u.cookie, { title: "App crash", priority: "URGENT" });
    await api(admin.cookie).patch(`/api/tickets/${t1.id}/status`).send({ status: "IN_PROGRESS" });
    expect((await api(admin.cookie).get("/api/tickets?status=IN_PROGRESS")).body.items).toHaveLength(1);
    expect((await api(admin.cookie).get("/api/tickets?priority=URGENT")).body.items[0].title).toBe("App crash");
    expect((await api(admin.cookie).get("/api/tickets?q=refund")).body.total).toBe(1);
    const p2 = await api(admin.cookie).get("/api/tickets?page=2&limit=1&sort=createdAt&order=asc");
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.items[0].title).toBe("App crash");
    expect(p2.body.total).toBe(2);
    const byPrio = await api(admin.cookie).get("/api/tickets?sort=priority&order=desc");
    expect(byPrio.body.items[0].priority).toBe("URGENT");
  });

  it("rejects absurd pagination and unlisted sort columns", async () => {
    const { cookie } = await makeUser();
    expect((await api(cookie).get("/api/tickets?limit=100000")).status).toBe(400);
    expect((await api(cookie).get("/api/tickets?page=-1")).status).toBe(400);
    expect((await api(cookie).get("/api/tickets?sort=passwordHash")).status).toBe(400);
  });
});

describe("access control", () => {
  it("returns 404 (not 403) for another user's ticket on get/patch/delete", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const t = await mk(a.cookie);
    expect((await api(b.cookie).get(`/api/tickets/${t.id}`)).status).toBe(404);
    expect((await api(b.cookie).patch(`/api/tickets/${t.id}`).send({ title: "hax" })).status).toBe(404);
    expect((await api(b.cookie).delete(`/api/tickets/${t.id}`)).status).toBe(404);
  });

  it("returns 404 for a malformed id, never 500", async () => {
    const { cookie } = await makeUser();
    expect((await api(cookie).get("/api/tickets/not-a-uuid")).status).toBe(404);
  });

  it("admin can view any ticket with creator and comment count", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(u.cookie);
    const res = await api(admin.cookie).get(`/api/tickets/${t.id}`);
    expect(res.status).toBe(200);
    expect(res.body.createdBy.id).toBe(u.user.id);
    expect(res.body.commentCount).toBe(0);
  });
});

describe("user edit / delete rules", () => {
  it("edits an OPEN ticket and records TICKET_UPDATED with a diff", async () => {
    const u = await makeUser();
    const t = await mk(u.cookie);
    const res = await api(u.cookie).patch(`/api/tickets/${t.id}`).send({ title: "New title" });
    expect(res.status).toBe(200);
    const evs = await events("TICKET_UPDATED");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.payload).toMatchObject({ changes: { title: { from: "Cannot log in", to: "New title" } } });
  });

  it("is a no-op (no event) when nothing changes", async () => {
    const u = await makeUser();
    const t = await mk(u.cookie);
    await api(u.cookie).patch(`/api/tickets/${t.id}`).send({ title: body.title });
    expect(await events("TICKET_UPDATED")).toHaveLength(0);
  });

  it("refuses edits once the ticket is no longer OPEN and refuses a status field", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(u.cookie);
    expect((await api(u.cookie).patch(`/api/tickets/${t.id}`).send({ status: "RESOLVED" })).status).toBe(400);
    await api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "IN_PROGRESS" });
    expect((await api(u.cookie).patch(`/api/tickets/${t.id}`).send({ title: "late" })).status).toBe(409);
    expect((await api(u.cookie).delete(`/api/tickets/${t.id}`)).status).toBe(409);
  });

  it("soft-deletes an OPEN ticket", async () => {
    const u = await makeUser();
    const t = await mk(u.cookie);
    expect((await api(u.cookie).delete(`/api/tickets/${t.id}`)).status).toBe(204);
    expect((await api(u.cookie).get(`/api/tickets/${t.id}`)).status).toBe(404);
    expect((await api(u.cookie).get("/api/tickets")).body.total).toBe(0);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("only admins can change priority via PATCH, and nothing else", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(u.cookie);
    expect((await api(admin.cookie).patch(`/api/tickets/${t.id}`).send({ priority: "URGENT" })).status).toBe(200);
    expect((await api(admin.cookie).patch(`/api/tickets/${t.id}`).send({ title: "admin edit" })).status).toBe(403);
    expect((await api(admin.cookie).delete(`/api/tickets/${t.id}`)).status).toBe(403);
  });
});

describe("status transitions and events", () => {
  it("forbids users from changing status", async () => {
    const u = await makeUser();
    const t = await mk(u.cookie);
    expect((await api(u.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "RESOLVED" })).status).toBe(403);
  });

  it("emits STATUS_CHANGED and TICKET_RESOLVED once on resolve, sets resolvedAt", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(u.cookie);
    const res = await api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "RESOLVED" });
    expect(res.status).toBe(200);
    expect(res.body.resolvedAt).not.toBeNull();
    expect(await events("STATUS_CHANGED")).toHaveLength(1);
    expect(await events("TICKET_RESOLVED")).toHaveLength(1);
    // same status again: no-op, no new events
    await api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "RESOLVED" });
    expect(await events("STATUS_CHANGED")).toHaveLength(1);
    expect(await events("TICKET_RESOLVED")).toHaveLength(1);
  });

  it("two concurrent resolves still emit exactly one pair", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(u.cookie);
    await Promise.all([
      api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "RESOLVED" }),
      api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "RESOLVED" }),
    ]);
    expect(await events("STATUS_CHANGED")).toHaveLength(1);
    expect(await events("TICKET_RESOLVED")).toHaveLength(1);
  });

  it("enforces the transition matrix (CLOSED only reopens) and clears resolvedAt on reopen", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(u.cookie);
    const set = (status: string) => api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status });
    expect((await set("CLOSED")).status).toBe(200);
    expect((await set("RESOLVED")).status).toBe(409);
    expect((await set("IN_PROGRESS")).status).toBe(409);
    const reopened = await set("OPEN");
    expect(reopened.status).toBe(200);
    expect((await set("RESOLVED")).body.resolvedAt).not.toBeNull();
    expect((await set("OPEN")).body.resolvedAt).toBeNull();
  });

  it("rejects an invalid status value", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const t = await mk(u.cookie);
    expect((await api(admin.cookie).patch(`/api/tickets/${t.id}/status`).send({ status: "DONE" })).status).toBe(400);
  });
});
