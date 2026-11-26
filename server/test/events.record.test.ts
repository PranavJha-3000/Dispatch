import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { HANDLER_NAMES, recordEvent } from "../src/modules/events/record.js";
import { makeUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

describe("recordEvent (outbox write side)", () => {
  it("creates one event and one PENDING delivery per handler in the caller's transaction", async () => {
    const { user } = await makeUser();
    const ev = await prisma.$transaction((tx) =>
      recordEvent(tx, { type: "TICKET_CREATED", actorId: user.id, payload: { hello: "world" } }),
    );
    const deliveries = await prisma.eventDelivery.findMany({ where: { eventId: ev.id }, orderBy: { handler: "asc" } });
    expect(HANDLER_NAMES).toEqual(["notification", "email"]);
    expect(deliveries.map((d) => d.handler).sort()).toEqual(["email", "notification"]);
    expect(deliveries.every((d) => d.status === "PENDING" && d.attempts === 0)).toBe(true);
  });

  it("rolls back event and deliveries together when the transaction fails", async () => {
    const { user } = await makeUser();
    await expect(
      prisma.$transaction(async (tx) => {
        await recordEvent(tx, { type: "TICKET_CREATED", actorId: user.id, payload: {} });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await prisma.event.count()).toBe(0);
    expect(await prisma.eventDelivery.count()).toBe(0);
  });

  it("makes duplicate (event, handler) deliveries impossible", async () => {
    const { user } = await makeUser();
    const ev = await prisma.$transaction((tx) => recordEvent(tx, { type: "TICKET_CREATED", actorId: user.id, payload: {} }));
    await expect(prisma.eventDelivery.create({ data: { eventId: ev.id, handler: "email" } })).rejects.toThrow();
  });
});
