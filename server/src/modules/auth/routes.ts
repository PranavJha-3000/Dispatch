import { Router, type CookieOptions } from "express";
import { rateLimit } from "express-rate-limit";
import { config } from "../../config.js";
import { COOKIE_NAME, requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { AppError } from "../../errors.js";
import { loginSchema, registerSchema } from "./schema.js";
import * as service from "./service.js";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.cookieSecure,
  path: "/",
};

export function authRoutes(loginRateLimit = config.loginRateLimit) {
  const router = Router();

  // Only failed logins count, so legitimate use is never throttled.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginRateLimit,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Too many attempts, try again later")),
  });

  router.post("/register", validate({ body: registerSchema }), async (req, res) => {
    res.status(201).json(await service.register(req.body));
  });

  router.post("/login", limiter, validate({ body: loginSchema }), async (req, res) => {
    const { token, user } = await service.login(req.body.email, req.body.password);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 60 * 60 * 1000 });
    res.json(user);
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.status(204).end();
  });

  router.get("/me", requireAuth, async (req, res) => {
    res.json(await service.me(req.user!.id));
  });

  return router;
}
