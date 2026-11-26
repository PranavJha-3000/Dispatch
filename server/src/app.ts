import express, { Router } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { existsSync } from "node:fs";
import { config } from "./config.js";
import { csrfGuard } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRoutes } from "./modules/auth/routes.js";
import { ticketRoutes } from "./modules/tickets/routes.js";
import { notificationRoutes } from "./modules/notifications/routes.js";

export type AppOptions = { loginRateLimit?: number };

export function createApp(opts: AppOptions = {}) {
  const app = express();
  if (config.nodeEnv === "production") app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  const api = Router();
  api.use(csrfGuard);
  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  mountModules(api, opts);
  api.use(notFoundHandler);
  app.use("/api", api);

  if (config.webDist && existsSync(config.webDist)) {
    app.use(express.static(config.webDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.resolve(config.webDist!, "index.html")));
  }

  app.use(errorHandler);
  return app;
}

// Module routers are registered here as each module lands.
function mountModules(api: Router, opts: AppOptions) {
  api.use("/auth", authRoutes(opts.loginRateLimit));
  api.use("/tickets", ticketRoutes());
  api.use("/notifications", notificationRoutes());
}
