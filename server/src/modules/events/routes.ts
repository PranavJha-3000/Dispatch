import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { notFound } from "../../errors.js";
import { getStats } from "../stats/service.js";
import { isUuid } from "../tickets/service.js";
import { nudge, retryDelivery } from "./dispatcher.js";
import * as service from "./service.js";

const listQuery = z.object({
  type: z.enum(["TICKET_CREATED", "TICKET_UPDATED", "STATUS_CHANGED", "COMMENT_ADDED", "TICKET_RESOLVED"]).optional(),
  status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"]).optional(),
  ticketId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function adminRoutes() {
  const router = Router();
  router.use(requireAuth, requireRole("ADMIN"));

  router.get("/events", validate({ query: listQuery }), async (req, res) => {
    res.json(await service.listEvents(req.query as never));
  });

  router.get("/events/:id", async (req, res) => {
    res.json(await service.getEvent(String(req.params.id)));
  });

  router.post("/event-deliveries/:id/retry", async (req, res) => {
    const id = String(req.params.id);
    if (!isUuid(id)) throw notFound("Delivery not found");
    await retryDelivery(id);
    nudge();
    res.json({ ok: true });
  });

  router.get("/stats", async (_req, res) => {
    res.json(await getStats());
  });

  return router;
}
