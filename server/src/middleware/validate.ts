import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../errors.js";

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

// Express 5 makes req.query read-only, so parsed values are defined onto the request.
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(
          badRequest(
            "Invalid request",
            result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          ),
        );
      }
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true, enumerable: true });
    }
    next();
  };
