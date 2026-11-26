import { prisma } from "../../db.js";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const DAY = 86_400_000;

export async function getStats() {
  const live = { deletedAt: null };
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const from = new Date(start.getTime() - 6 * DAY);

  const [byStatusRows, byPriorityRows, recent, resolved, failedDeliveries] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where: live, _count: true }),
    prisma.ticket.groupBy({ by: ["priority"], where: live, _count: true }),
    prisma.ticket.findMany({ where: { ...live, createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.ticket.findMany({ where: { ...live, status: "RESOLVED", resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true } }),
    prisma.eventDelivery.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, byStatusRows.find((r) => r.status === s)?._count ?? 0]));
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, byPriorityRows.find((r) => r.priority === p)?._count ?? 0]));
  const createdLast7Days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(from.getTime() + i * DAY);
    const key = day.toISOString().slice(0, 10);
    return { date: key, count: recent.filter((t) => t.createdAt.toISOString().slice(0, 10) === key).length };
  });
  const avgResolutionHours = resolved.length
    ? resolved.reduce((sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) / resolved.length / 3_600_000
    : null;

  return {
    total: byStatusRows.reduce((n, r) => n + r._count, 0),
    byStatus,
    byPriority,
    createdLast7Days,
    avgResolutionHours,
    failedDeliveries,
  };
}
