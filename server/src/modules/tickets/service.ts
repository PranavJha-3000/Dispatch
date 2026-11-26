import { Prisma, type Priority, type Ticket, type TicketStatus } from "@prisma/client";
import { prisma } from "../../db.js";
import { conflict, forbidden, notFound } from "../../errors.js";
import type { AuthUser } from "../../middleware/auth.js";
import { recordEvent } from "../events/record.js";
import type { ListQuery } from "./schema.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Allowed status transitions. Same-state is a no-op handled before this lookup.
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["OPEN", "IN_PROGRESS", "CLOSED"],
  CLOSED: ["OPEN"],
};

export type TicketDto = Omit<Ticket, "deletedAt">;
const toDto = ({ deletedAt: _d, ...t }: Ticket): TicketDto => t;

const withMeta = { createdBy: { select: { id: true, name: true } }, _count: { select: { comments: true } } } as const;
const toDetail = (t: Ticket & { createdBy: { id: string; name: string }; _count: { comments: number } }) => {
  const { _count, ...rest } = t;
  return { ...toDto(rest), commentCount: _count.comments };
};

export const isUuid = (id: string) => UUID.test(id);

/** Returns the live ticket if the actor may see it; 404 otherwise (never reveals existence). */
export async function assertTicketAccess(actor: AuthUser, id: string): Promise<Ticket> {
  if (!isUuid(id)) throw notFound("Ticket not found");
  const t = await prisma.ticket.findFirst({ where: { id, deletedAt: null } });
  if (!t || (actor.role !== "ADMIN" && t.createdById !== actor.id)) throw notFound("Ticket not found");
  return t;
}

export async function createTicket(
  actor: AuthUser,
  input: { title: string; description: string; category: Ticket["category"]; priority: Priority },
): Promise<TicketDto> {
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.create({ data: { ...input, createdById: actor.id } });
    await recordEvent(tx, {
      type: "TICKET_CREATED",
      ticketId: t.id,
      actorId: actor.id,
      payload: { title: t.title, category: t.category, priority: t.priority },
    });
    return toDto(t);
  });
}

export async function listTickets(actor: AuthUser, q: ListQuery) {
  const where: Prisma.TicketWhereInput = {
    deletedAt: null,
    ...(actor.role === "ADMIN" ? {} : { createdById: actor.id }),
    ...(q.status ? { status: q.status } : {}),
    ...(q.priority ? { priority: q.priority } : {}),
    ...(q.q
      ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: withMeta,
    }),
  ]);
  return { items: rows.map(toDetail), total, page: q.page, limit: q.limit };
}

export async function getTicket(actor: AuthUser, id: string) {
  await assertTicketAccess(actor, id);
  const t = await prisma.ticket.findUniqueOrThrow({ where: { id }, include: withMeta });
  return toDetail(t);
}

type Patch = Partial<Pick<Ticket, "title" | "description" | "category" | "priority">>;

export async function updateTicket(actor: AuthUser, id: string, patch: Patch): Promise<TicketDto> {
  await assertTicketAccess(actor, id);
  if (actor.role === "ADMIN" && Object.keys(patch).some((k) => k !== "priority")) throw forbidden("Admins can only change priority");
  return prisma.$transaction(async (tx) => {
    // Lock first so the OPEN check and the diff see the same row a concurrent status change would.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM tickets WHERE id = ${id}::uuid FOR UPDATE`);
    const current = await tx.ticket.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound("Ticket not found");
    if (actor.role !== "ADMIN" && current.status !== "OPEN") throw conflict("Only open tickets can be edited");
    const changes: Record<string, { from: string; to: string }> = {};
    for (const [k, v] of Object.entries(patch) as [keyof Patch, string][]) {
      if (v !== undefined && current[k] !== v) changes[k] = { from: String(current[k]), to: v };
    }
    if (Object.keys(changes).length === 0) return toDto(current);
    const t = await tx.ticket.update({ where: { id }, data: patch });
    await recordEvent(tx, { type: "TICKET_UPDATED", ticketId: id, actorId: actor.id, payload: { changes } });
    return toDto(t);
  });
}

export async function changeStatus(actor: AuthUser, id: string, to: TicketStatus): Promise<TicketDto> {
  await assertTicketAccess(actor, id);
  return prisma.$transaction(async (tx) => {
    // Row lock serialises concurrent status changes so events are emitted exactly once.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM tickets WHERE id = ${id}::uuid FOR UPDATE`);
    const current = await tx.ticket.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound("Ticket not found");
    if (current.status === to) return toDto(current);
    if (!TRANSITIONS[current.status].includes(to)) {
      throw conflict(`Cannot move a ${current.status} ticket to ${to}`);
    }
    const now = new Date();
    const t = await tx.ticket.update({
      where: { id },
      data: { status: to, resolvedAt: to === "RESOLVED" ? now : to === "CLOSED" ? current.resolvedAt : null },
    });
    await recordEvent(tx, {
      type: "STATUS_CHANGED",
      ticketId: id,
      actorId: actor.id,
      payload: { from: current.status, to },
    });
    if (to === "RESOLVED") {
      await recordEvent(tx, { type: "TICKET_RESOLVED", ticketId: id, actorId: actor.id, payload: { resolvedAt: now.toISOString() } });
    }
    return toDto(t);
  });
}

export async function deleteTicket(actor: AuthUser, id: string): Promise<void> {
  const t = await assertTicketAccess(actor, id);
  if (t.createdById !== actor.id) throw forbidden("Only the ticket owner can delete it");
  const res = await prisma.ticket.updateMany({ where: { id, status: "OPEN", deletedAt: null }, data: { deletedAt: new Date() } });
  if (res.count === 0) throw conflict("Only open tickets can be deleted");
}
