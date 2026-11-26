import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import * as service from "./service.js";

const createCommentSchema = z.object({ body: z.string().trim().min(1).max(5000) });

// Mounted under /tickets/:id (auth + id validation already applied by the tickets router).
export function commentRoutes() {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res) => {
    res.json(await service.listComments(req.user!, String((req.params as Record<string, string>).id)));
  });

  router.post("/", validate({ body: createCommentSchema }), async (req, res) => {
    res.status(201).json(await service.addComment(req.user!, String((req.params as Record<string, string>).id), req.body));
  });

  return router;
}
