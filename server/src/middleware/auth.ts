import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { forbidden, unauthenticated } from "../errors.js";

export const COOKIE_NAME = "dispatch_token";

export type AuthUser = { id: string; role: Role };

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** Verifies the JWT cookie and loads the user; the role always comes from the database. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== "string") return next(unauthenticated());
  let sub: string;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.sub !== "string") return next(unauthenticated());
    sub = payload.sub;
  } catch {
    return next(unauthenticated());
  }
  const user = await prisma.user.findUnique({ where: { id: sub }, select: { id: true, role: true } }).catch(() => null);
  if (!user) return next(unauthenticated());
  req.user = user;
  next();
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => (req.user?.role === role ? next() : next(forbidden("Insufficient permissions")));
