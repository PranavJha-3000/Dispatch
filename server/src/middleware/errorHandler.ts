import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, notFound } from "../errors.js";
import { logger } from "../logger.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound("Route not found"));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    return;
  }
  // body-parser errors (malformed JSON, payload too large)
  if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
    res
      .status(err.type === "entity.too.large" ? 413 : 400)
      .json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body" } });
    return;
  }
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
};
