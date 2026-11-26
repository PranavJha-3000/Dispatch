import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { notFound } from "../../errors.js";
import { commentRoutes } from "../comments/routes.js";
import { nudge } from "../events/dispatcher.js";
import { createTicketSchema, listQuerySchema, patchTicketSchema, statusSchema } from "./schema.js";
import * as service from "./service.js";

export function ticketRoutes() {
  const router = Router();
  router.use(requireAuth);

  // A malformed id is simply "not found", never a 500 or a validation oracle.
  router.param("id", (_req, _res, next, id) => (service.isUuid(String(id)) ? next() : next(notFound("Ticket not found"))));

  router.get("/", validate({ query: listQuerySchema }), async (req, res) => {
    res.json(await service.listTickets(req.user!, req.query as never));
  });

  router.post("/", validate({ body: createTicketSchema }), async (req, res) => {
    const t = await service.createTicket(req.user!, req.body);
    nudge();
    res.status(201).json(t);
  });

  router.get("/:id", async (req, res) => {
    res.json(await service.getTicket(req.user!, String(req.params.id)));
  });

  router.patch("/:id", validate({ body: patchTicketSchema }), async (req, res) => {
    const t = await service.updateTicket(req.user!, String(req.params.id), req.body);
    nudge();
    res.json(t);
  });

  router.patch("/:id/status", requireRole("ADMIN"), validate({ body: statusSchema }), async (req, res) => {
    const t = await service.changeStatus(req.user!, String(req.params.id), req.body.status);
    nudge();
    res.json(t);
  });

  router.use("/:id/comments", commentRoutes());

  router.delete("/:id", async (req, res) => {
    await service.deleteTicket(req.user!, String(req.params.id));
    res.status(204).end();
  });

  return router;
}
