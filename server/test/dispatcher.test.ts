import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { config } from "../src/config.js";
import { dispatchDue, handlers, retryDelivery } from "../src/modules/events/dispatcher.js";
import { api, makeAdmin, makeUser, resetDb } from "./helpers.js";

const original = { ...handlers };
beforeEach(resetDb);
afterEach(() => {
  Object.assign(handlers, original);
  (config as { failHandler?: string }).failHandler = undefined;
});

async function newTicket() {
  const u = await makeUser();
  const res = await api(u.cookie).post("/api/tickets").send({ title: "Broken", description: "It is broken" });
  return { ...u, ticketId: res.body.id as string };
}
const delivery = (handler: string) => prisma.eventDelivery.findFirstOrThrow({ where: { handler } });
const future = (ms = 10 * 60_000) => new Date(Date.now() + ms);

describe("dispatchDue", () => {
  it("runs every handler and records success, attempts and duration", async () => {
    await newTicket();
    expect(await dispatchDue()).toBe(2);
    for (const h of ["notification", "email"]) {
      const d = await delivery(h);
      expect(d.status).toBe("SUCCEEDED");
      expect(d.attempts).toBe(1);
      expect(d.durationMs).toBeGreaterThanOrEqual(0);
      expect(d.leaseToken).toBeNull();
    }
  });

  it("isolates a failing handler: ticket intact, failure recorded, backoff scheduled", async () => {
    const { ticketId } = await newTicket();
    handlers.email = async () => {
      throw new Error("smtp down");
    };
    await dispatchDue();
    const email = await delivery("email");
    expect(email.status).toBe("FAILED");
    expect(email.attempts).toBe(1);
    expect(email.lastError).toContain("smtp down");
    expect(email.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect((await delivery("notification")).status).toBe("SUCCEEDED");
    expect(await prisma.ticket.findUnique({ where: { id: ticketId } })).not.toBeNull();
  });

  it("does not retry before nextAttemptAt, retries after, and succeeds when healthy", async () => {
    await newTicket();
    let fail = true;
    handlers.email = async () => {
      if (fail) throw new Error("flaky");
    };
    await dispatchDue();
    expect(await dispatchDue()).toBe(0);
    fail = false;
    expect(await dispatchDue(future())).toBe(1);
    expect((await delivery("email")).status).toBe("SUCCEEDED");
  });

  it("dead-letters after the max attempts and never runs it again", async () => {
    await newTicket();
    const spy = vi.fn(async () => {
      throw new Error("always");
    });
    handlers.email = spy;
    for (let i = 0; i < config.maxDeliveryAttempts + 2; i++) await dispatchDue(future(24 * 3600_000 * (i + 1)));
    const email = await delivery("email");
    expect(email.status).toBe("DEAD");
    expect(email.attempts).toBe(config.maxDeliveryAttempts);
    expect(spy).toHaveBeenCalledTimes(config.maxDeliveryAttempts);
  });

  it("executes each handler once when two dispatchers race", async () => {
    await newTicket();
    const spy = vi.fn(async () => {});
    handlers.email = spy;
    await Promise.all([dispatchDue(), dispatchDue()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("lease recovery", () => {
  it("reclaims a RUNNING delivery whose lease expired (crashed worker)", async () => {
    await newTicket();
    const spy = vi.fn(async () => {});
    handlers.email = spy;
    const d = await delivery("email");
    await prisma.eventDelivery.update({
      where: { id: d.id },
      data: { status: "RUNNING", attempts: 1, leaseToken: "dead-worker", lockedUntil: new Date(Date.now() - 1000) },
    });
    await dispatchDue();
    expect(spy).toHaveBeenCalledTimes(1);
    const after = await delivery("email");
    expect(after.status).toBe("SUCCEEDED");
    expect(after.attempts).toBe(2);
  });

  it("leaves a RUNNING delivery with a live lease alone", async () => {
    await newTicket();
    const spy = vi.fn(async () => {});
    handlers.email = spy;
    const d = await delivery("email");
    await prisma.eventDelivery.update({
      where: { id: d.id },
      data: { status: "RUNNING", attempts: 1, leaseToken: "alive", lockedUntil: future() },
    });
    await dispatchDue();
    expect(spy).not.toHaveBeenCalled();
  });

  it("dead-letters an expired lease that already used all attempts, without running it", async () => {
    await newTicket();
    const spy = vi.fn(async () => {});
    handlers.email = spy;
    const d = await delivery("email");
    await prisma.eventDelivery.update({
      where: { id: d.id },
      data: { status: "RUNNING", attempts: config.maxDeliveryAttempts, leaseToken: "x", lockedUntil: new Date(Date.now() - 1000) },
    });
    await dispatchDue();
    expect(spy).not.toHaveBeenCalled();
    expect((await delivery("email")).status).toBe("DEAD");
  });

  it("ignores a stale completion once the lease was taken over", async () => {
    await newTicket();
    handlers.email = async () => {
      await prisma.eventDelivery.updateMany({ where: { handler: "email" }, data: { leaseToken: "taken-over" } });
    };
    await dispatchDue();
    const d = await delivery("email");
    expect(d.status).toBe("RUNNING");
    expect(d.leaseToken).toBe("taken-over");
  });
});

describe("fault injection", () => {
  it("FAIL_HANDLER makes the named handler fail outside production", async () => {
    await newTicket();
    (config as { failHandler?: string }).failHandler = "email";
    await dispatchDue();
    const d = await delivery("email");
    expect(d.status).toBe("FAILED");
    expect(d.lastError).toContain("FAIL_HANDLER");
  });
});

describe("retryDelivery", () => {
  it("revives a DEAD delivery, refuses SUCCEEDED, 404s unknown", async () => {
    await newTicket();
    const d = await delivery("email");
    await prisma.eventDelivery.update({ where: { id: d.id }, data: { status: "DEAD", attempts: 5 } });
    await retryDelivery(d.id);
    const after = await delivery("email");
    expect(after.status).toBe("PENDING");
    expect(after.attempts).toBe(0);
    await dispatchDue();
    await expect(retryDelivery(d.id)).rejects.toMatchObject({ status: 409 });
    await expect(retryDelivery("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
  });
});

describe("notification handler", () => {
  async function scenario() {
    const owner = await makeUser("USER", { name: "Olive Owner" });
    const admin1 = await makeAdmin();
    const admin2 = await makeAdmin();
    const t = await api(owner.cookie).post("/api/tickets").send({ title: "Printer on fire", description: "Smoke" });
    return { owner, admin1, admin2, id: t.body.id as string };
  }
  const notesFor = (userId: string) => prisma.notification.findMany({ where: { userId } });

  it("TICKET_CREATED notifies all admins, not the actor", async () => {
    const s = await scenario();
    await dispatchDue();
    expect(await notesFor(s.admin1.user.id)).toHaveLength(1);
    expect(await notesFor(s.admin2.user.id)).toHaveLength(1);
    expect(await notesFor(s.owner.user.id)).toHaveLength(0);
  });

  it("an admin comment notifies the owner only; a user comment notifies admins only", async () => {
    const s = await scenario();
    await dispatchDue();
    await prisma.notification.deleteMany();
    await api(s.admin1.cookie).post(`/api/tickets/${s.id}/comments`).send({ body: "On it" });
    await dispatchDue();
    expect(await notesFor(s.owner.user.id)).toHaveLength(1);
    expect(await notesFor(s.admin1.user.id)).toHaveLength(0);
    expect(await notesFor(s.admin2.user.id)).toHaveLength(0);
    await prisma.notification.deleteMany();
    await api(s.owner.cookie).post(`/api/tickets/${s.id}/comments`).send({ body: "Thanks" });
    await dispatchDue();
    expect(await notesFor(s.owner.user.id)).toHaveLength(0);
    expect(await notesFor(s.admin1.user.id)).toHaveLength(1);
    expect(await notesFor(s.admin2.user.id)).toHaveLength(1);
  });

  it("status change notifies the owner once; resolving yields exactly one notification, not two", async () => {
    const s = await scenario();
    await dispatchDue();
    await prisma.notification.deleteMany();
    await api(s.admin1.cookie).patch(`/api/tickets/${s.id}/status`).send({ status: "IN_PROGRESS" });
    await dispatchDue();
    expect(await notesFor(s.owner.user.id)).toHaveLength(1);
    await prisma.notification.deleteMany();
    await api(s.admin1.cookie).patch(`/api/tickets/${s.id}/status`).send({ status: "RESOLVED" });
    await dispatchDue();
    const notes = await notesFor(s.owner.user.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toMatch(/resolved/i);
  });

  it("is idempotent: re-running the handler for the same event never duplicates rows", async () => {
    const s = await scenario();
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "TICKET_CREATED" } });
    const ctx = { deliveryId: "d1", idempotencyKey: `${ev.id}:notification` };
    await handlers.notification(ev, ctx);
    await handlers.notification(ev, ctx);
    expect(await notesFor(s.admin1.user.id)).toHaveLength(1);
  });
});
