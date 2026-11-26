import type { RequestHandler } from "express";
import { forbidden } from "../errors.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie auth: SameSite=Lax cookie, plus every state-changing request must
 * (a) come from our own origin if it carries an Origin header, and
 * (b) carry a custom header, which a cross-site form or simple request cannot set.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method)) return next();
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) return next(forbidden("Cross-origin request blocked"));
    } catch {
      return next(forbidden("Invalid origin"));
    }
  }
  if (req.get("x-requested-with") !== "dispatch") return next(forbidden("Missing CSRF header"));
  next();
};
