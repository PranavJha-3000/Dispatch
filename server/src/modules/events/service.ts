import { Prisma, type DeliveryStatus, type EventType } from "@prisma/client";
import { prisma } from "../../db.js";
import { notFound } from "../../errors.js";
import type { AuthUser } from "../../middleware/auth.js";
import { assertTicketAccess, isUuid } from "../tickets/service.js";

const actorSelect = { select: { id: true, name: true, role: true } } as const;

export async function listEvents(q: { type?: EventType; status?: DeliveryStatus; ticketId?: string; page: number; limit: number }) {
  const where: Prisma.EventWhereInput = {
    ...(q.type ? { type: q.type } : {}),
    ...(q.ticketId ? { ticketId: q.ticketId } : {}),
    ...(q.status ? { deliveries: { some: { status: q.status } } } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: { seq: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { actor: actorSelect, ticket: { select: { id: true, title: true } }, deliveries: { orderBy: { handler: "asc" } } },
    }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}

export async function getEvent(id: string) {
  if (!isUuid(id)) throw notFound("Event not found");
  const ev = await prisma.event.findUnique({
    where: { id },
    include: { actor: actorSelect, ticket: { select: { id: true, title: true } }, deliveries: { orderBy: { handler: "asc" } } },
  });
  if (!ev) throw notFound("Event not found");
  return ev;
}

/** Ticket timeline: a read over the events table, scoped by ticket access rules. */
export async function getTicketActivity(actor: AuthUser, ticketId: string) {
  await assertTicketAccess(actor, ticketId);
  return prisma.event.findMany({
    where: { ticketId },
    orderBy: { seq: "asc" },
    select: { id: true, type: true, payload: true, createdAt: true, actor: actorSelect },
  });
}
