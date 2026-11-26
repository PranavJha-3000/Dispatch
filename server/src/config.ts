import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    DISPATCHER_INTERVAL_MS: z.coerce.number().int().default(2000),
    MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().default(5),
    LEASE_MS: z.coerce.number().int().default(60_000),
    LOGIN_RATE_LIMIT: z.coerce.number().int().default(10),
    FAIL_HANDLER: z.string().optional(),
    WEB_DIST: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // A fault-injection flag must never be able to run in production.
    if (env.NODE_ENV === "production" && env.FAIL_HANDLER) {
      ctx.addIssue({ code: "custom", message: "FAIL_HANDLER is not allowed in production", path: ["FAIL_HANDLER"] });
    }
  });

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = schema.parse(env);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    cookieSecure: e.NODE_ENV === "production",
    dispatcherIntervalMs: e.DISPATCHER_INTERVAL_MS,
    maxDeliveryAttempts: e.MAX_DELIVERY_ATTEMPTS,
    leaseMs: e.LEASE_MS,
    loginRateLimit: e.LOGIN_RATE_LIMIT,
    failHandler: e.NODE_ENV === "production" ? undefined : e.FAIL_HANDLER,
    webDist: e.WEB_DIST,
  };
}

export const config = loadConfig();
