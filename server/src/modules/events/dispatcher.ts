import { Prisma } from "@prisma/client";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { conflict, notFound } from "../../errors.js";
import { logger } from "../../logger.js";
import { defaultHandlers, type Handler } from "./handlers.js";
import type { HandlerName } from "./record.js";

export type { Handler } from "./handlers.js";

/** Mutable on purpose: tests swap a handler to simulate failures. */
export const handlers: Record<HandlerName, Handler> = { ...defaultHandlers };

const BATCH = 20;
const BASE_BACKOFF_MS = 5000;

// Prisma stores timestamp(3) as naive UTC; raw Date params are zone-interpreted, so normalise explicitly.
const ts = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

type Claimed = { id: string; eventId: string; handler: string; attempts: number; leaseToken: string };

/**
 * Claims due deliveries with a lease. A delivery is due when it is PENDING/FAILED and its
 * nextAttemptAt has passed, or RUNNING with an expired lease (worker crashed mid-run).
 * Attempts are counted at claim time so a crash-looping delivery cannot run forever.
 */
async function claim(now: Date): Promise<Claimed[]> {
  const lockedUntil = new Date(now.getTime() + config.leaseMs);
  return prisma.$transaction(async (tx) => {
    await tx.eventDelivery.updateMany({
      where: { status: "RUNNING", lockedUntil: { lt: now }, attempts: { gte: config.maxDeliveryAttempts } },
      data: { status: "DEAD", lastError: "Lease expired after the maximum number of attempts", leaseToken: null, lockedUntil: null },
    });
    return tx.$queryRaw<Claimed[]>(Prisma.sql`
      UPDATE event_deliveries SET
        status = 'RUNNING', attempts = attempts + 1,
        "leaseToken" = gen_random_uuid()::text, "lockedUntil" = ${ts(lockedUntil)}, "updatedAt" = ${ts(now)}
      WHERE id IN (
        SELECT id FROM event_deliveries
        WHERE (status IN ('PENDING','FAILED') AND "nextAttemptAt" <= ${ts(now)})
           OR (status = 'RUNNING' AND "lockedUntil" < ${ts(now)})
        ORDER BY "nextAttemptAt" ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED)
      RETURNING id, "eventId", handler, attempts, "leaseToken"`);
  });
}

async function run(d: Claimed, now: Date): Promise<void> {
  const started = Date.now();
  let error: string | null = null;
  try {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: d.eventId } });
    if (config.failHandler && config.failHandler === d.handler) throw new Error("Injected failure (FAIL_HANDLER)");
    const fn = handlers[d.handler as HandlerName];
    if (!fn) throw new Error(`No handler registered for "${d.handler}"`);
    await fn(event, { deliveryId: d.id, idempotencyKey: `${d.eventId}:${d.handler}` });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const durationMs = Date.now() - started;
  const exhausted = d.attempts >= config.maxDeliveryAttempts;
  const data = error === null
    ? { status: "SUCCEEDED" as const, durationMs, lastError: null, leaseToken: null, lockedUntil: null }
    : {
        status: exhausted ? ("DEAD" as const) : ("FAILED" as const),
        durationMs,
        lastError: error.slice(0, 1000),
        leaseToken: null,
        lockedUntil: null,
        nextAttemptAt: new Date(now.getTime() + BASE_BACKOFF_MS * 2 ** (d.attempts - 1)),
      };
  // Conditional on the lease token: a worker that lost its lease cannot overwrite the new owner's result.
  const res = await prisma.eventDelivery.updateMany({ where: { id: d.id, status: "RUNNING", leaseToken: d.leaseToken }, data });
  if (res.count === 0) logger.warn({ deliveryId: d.id }, "delivery lease lost; result discarded");
}

/** Processes due deliveries once. Returns how many were run. Safe to call concurrently. */
export async function dispatchDue(now: Date = new Date()): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await claim(now);
    for (const d of batch) await run(d, now);
    total += batch.length;
    if (batch.length < BATCH) return total;
  }
}

export async function retryDelivery(id: string): Promise<void> {
  const d = await prisma.eventDelivery.findUnique({ where: { id } }).catch(() => null);
  if (!d) throw notFound("Delivery not found");
  const res = await prisma.eventDelivery.updateMany({
    where: { id, status: { in: ["FAILED", "DEAD"] } },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), leaseToken: null, lockedUntil: null },
  });
  if (res.count === 0) throw conflict("Only failed or dead deliveries can be retried");
}

// --- background loop -------------------------------------------------------------------

let enabled = false;
let running = false;
let again = false;

async function pump(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await dispatchDue();
    } while (again);
  } catch (err) {
    logger.error({ err }, "dispatcher pass failed");
  } finally {
    running = false;
  }
}

/** Called after a transaction commits; a no-op until startDispatcher() (so tests stay deterministic). */
export function nudge(): void {
  if (enabled) void pump();
}

export function startDispatcher(): () => void {
  enabled = true;
  const timer = setInterval(() => void pump(), config.dispatcherIntervalMs);
  void pump();
  return () => {
    enabled = false;
    clearInterval(timer);
  };
}
