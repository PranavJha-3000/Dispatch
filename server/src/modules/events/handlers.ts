import type { Event } from "@prisma/client";
import { prisma } from "../../db.js";
import { logger } from "../../logger.js";
import type { HandlerName } from "./record.js";

export type HandlerContext = { deliveryId: string; idempotencyKey: string };
export type Handler = (event: Event, ctx: HandlerContext) => Promise<void>;

type Note = { userId: string; title: string; body: string };

async function admins(excludeId: string | null) {
  const rows = await prisma.user.findMany({ where: { role: "ADMIN", ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Who should hear about this event, and what to tell them. Never the actor themself. */
async function recipients(event: Event): Promise<Note[]> {
  if (!event.ticketId) return [];
  const ticket = await prisma.ticket.findUnique({ where: { id: event.ticketId } }); // includes soft-deleted
  if (!ticket) return [];
  const actor = event.actorId ? await prisma.user.findUnique({ where: { id: event.actorId } }) : null;
  const actorName = actor?.name ?? "Someone";
  const actorIsOwner = actor?.id === ticket.createdById;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const toOwner = (title: string, body: string): Note[] => (actorIsOwner ? [] : [{ userId: ticket.createdById, title, body }]);
  const toAdmins = async (title: string, body: string): Promise<Note[]> =>
    (await admins(actor?.id ?? null)).map((userId) => ({ userId, title, body }));
  const t = `"${ticket.title}"`;

  switch (event.type) {
    case "TICKET_CREATED":
      return toAdmins("New ticket", `${actorName} opened ${t}`);
    case "TICKET_UPDATED":
      return actorIsOwner ? toAdmins("Ticket updated", `${actorName} edited ${t}`) : toOwner("Ticket updated", `${t} was updated by support`);
    case "STATUS_CHANGED":
      // A resolve emits STATUS_CHANGED and TICKET_RESOLVED; only the latter notifies, so the owner hears once.
      if (payload.to === "RESOLVED") return [];
      return toOwner("Status changed", `${t} moved from ${label(payload.from)} to ${label(payload.to)}`);
    case "TICKET_RESOLVED":
      return toOwner("Ticket resolved", `${t} was marked as resolved`);
    case "COMMENT_ADDED":
      return payload.authorRole === "ADMIN"
        ? toOwner("New reply", `Support replied on ${t}`)
        : toAdmins("New comment", `${actorName} commented on ${t}`);
    default:
      return [];
  }
}

const notification: Handler = async (event) => {
  const notes = await recipients(event);
  if (notes.length === 0) return;
  // unique(userId, eventId) + skipDuplicates makes re-runs after a crash harmless.
  await prisma.notification.createMany({ data: notes.map((n) => ({ ...n, eventId: event.id })), skipDuplicates: true });
};

// Stand-in for a real mail provider; the idempotency key is what a provider call would send.
const email: Handler = async (event, ctx) => {
  logger.info({ eventId: event.id, type: event.type, idempotencyKey: ctx.idempotencyKey }, "email: would send");
};

export const defaultHandlers: Record<HandlerName, Handler> = { notification, email };

function label(v: unknown): string {
  return String(v).toLowerCase().replace(/_/g, " ");
}
