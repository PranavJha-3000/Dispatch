import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../errors.js";

type Issue = { code: string; message: string; minimum?: unknown; maximum?: unknown; format?: string; origin?: string };
function friendly(i: Issue): string {
  if (i.code === "too_small") return Number(i.minimum) <= 1 ? "This field is required" : `Must be at least ${i.minimum} ${i.origin === "string" ? "characters" : ""}`.trim();
  if (i.code === "too_big") return `Must be at most ${i.maximum} ${i.origin === "string" ? "characters" : ""}`.trim();
  if (i.code === "invalid_format" && i.format === "email") return "Enter a valid email address";
  if (i.code === "invalid_type") return "This field is required";
  return i.message;
}

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
            result.error.issues.map((i) => ({ path: i.path.join("."), message: friendly(i) })),
          ),
        );
      }
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true, enumerable: true });
    }
    next();
  };
