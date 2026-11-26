import { prisma } from "../../db.js";
import type { AuthUser } from "../../middleware/auth.js";
import { recordEvent } from "../events/record.js";
import { assertTicketAccess } from "../tickets/service.js";

const authorSelect = { select: { id: true, name: true, role: true } } as const;

export async function addComment(actor: AuthUser, ticketId: string, input: { body: string }) {
  await assertTicketAccess(actor, ticketId);
  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { ticketId, authorId: actor.id, body: input.body },
      include: { author: authorSelect },
    });
    await recordEvent(tx, {
      type: "COMMENT_ADDED",
      ticketId,
      actorId: actor.id,
      payload: { commentId: comment.id, authorRole: actor.role },
    });
    return comment;
  });
}

export async function listComments(actor: AuthUser, ticketId: string) {
  await assertTicketAccess(actor, ticketId);
  return prisma.comment.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { author: authorSelect },
  });
}
