import type { Event, EventType, Prisma } from "@prisma/client";
import type { Tx } from "../../db.js";

export const HANDLER_NAMES = ["notification", "email"] as const;
export type HandlerName = (typeof HANDLER_NAMES)[number];

export type NewEvent = {
  type: EventType;
  ticketId?: string;
  actorId: string;
  payload: Prisma.InputJsonValue;
};

/**
 * Outbox write side. Must be called with the caller's transaction so the domain change,
 * the event and its pending deliveries commit or roll back together.
 */
export async function recordEvent(tx: Tx, e: NewEvent): Promise<Event> {
  const event = await tx.event.create({
    data: { type: e.type, ticketId: e.ticketId ?? null, actorId: e.actorId, payload: e.payload },
  });
  await tx.eventDelivery.createMany({
    data: HANDLER_NAMES.map((handler) => ({ eventId: event.id, handler })),
  });
  return event;
}
