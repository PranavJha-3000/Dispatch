import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { notFound } from "../../errors.js";
import { requireAuth } from "../../middleware/auth.js";

const idSchema = z.uuid();

export function notificationRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const userId = req.user!.id;
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        include: { event: { select: { ticketId: true } } },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const items = rows.map(({ event, userId: _u, eventId: _e, ...n }) => ({ ...n, ticketId: event.ticketId }));
    res.json({ items, unreadCount });
  });

  router.post("/read-all", async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
    res.status(204).end();
  });

  router.patch("/:id/read", async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) throw notFound("Notification not found");
    const r = await prisma.notification.updateMany({ where: { id: id.data, userId: req.user!.id }, data: { readAt: new Date() } });
    if (r.count === 0) throw notFound("Notification not found");
    res.json({ ok: true });
  });

  return router;
}
