import argon2 from "argon2";
import { prisma } from "../src/db.js";
import { addComment } from "../src/modules/comments/service.js";
import { dispatchDue } from "../src/modules/events/dispatcher.js";
import { changeStatus, createTicket } from "../src/modules/tickets/service.js";
import type { AuthUser } from "../src/middleware/auth.js";
import type { Category, Priority, TicketStatus } from "@prisma/client";

// Idempotent: users are upserted; demo tickets are only created into an empty database (SEED_RESET=1 wipes first).
if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) throw new Error("SEED_PASSWORD is required in production");
const PASSWORD = process.env.SEED_PASSWORD ?? "Dispatch#2026";

const PEOPLE = [
  { email: "admin@dispatch.dev", name: "Alex Admin", role: "ADMIN" as const },
  { email: "demo@dispatch.dev", name: "Dana Demo", role: "USER" as const },
  { email: "jordan@dispatch.dev", name: "Jordan Lee", role: "USER" as const },
  { email: "priya@dispatch.dev", name: "Priya Nair", role: "USER" as const },
];

type Seed = {
  by: string; title: string; description: string; category: Category; priority: Priority;
  status?: TicketStatus; daysAgo: number; thread?: [admin: boolean, text: string][];
};

const TICKETS: Seed[] = [
  { by: "demo", title: "Cannot reset my password", description: "The reset email never arrives, even after checking spam.", category: "ACCOUNT", priority: "HIGH", status: "RESOLVED", daysAgo: 6,
    thread: [[true, "Thanks for flagging this. We found your address was on a suppression list and cleared it."], [false, "Got the email now, I am back in. Thank you!"]] },
  { by: "demo", title: "Charged twice for the March invoice", description: "I see two identical charges of $49 on my statement.", category: "BILLING", priority: "URGENT", status: "IN_PROGRESS", daysAgo: 5,
    thread: [[true, "Sorry about that. We have confirmed the duplicate and are processing a refund."], [false, "Great, how long will the refund take?"]] },
  { by: "demo", title: "Dark mode toggle is missing", description: "Would love a dark theme option in settings.", category: "FEATURE_REQUEST", priority: "LOW", daysAgo: 4 },
  { by: "jordan", title: "Export to CSV fails with a 500", description: "Clicking Export on the reports page returns an error after about ten seconds.", category: "BUG", priority: "HIGH", status: "IN_PROGRESS", daysAgo: 5,
    thread: [[true, "Reproduced. It only affects reports over 10k rows; a fix is in review."]] },
  { by: "jordan", title: "Update billing email address", description: "Please send invoices to finance@example.com instead.", category: "BILLING", priority: "MEDIUM", status: "RESOLVED", daysAgo: 6,
    thread: [[true, "Done. Invoices will go to finance@example.com from the next cycle."]] },
  { by: "jordan", title: "Two-factor codes arrive late", description: "SMS codes take 3 to 5 minutes to arrive, so they often expire.", category: "ACCOUNT", priority: "HIGH", daysAgo: 2 },
  { by: "priya", title: "Dashboard widgets overlap on tablet", description: "On an iPad in portrait the revenue and signup cards overlap.", category: "BUG", priority: "MEDIUM", daysAgo: 3,
    thread: [[true, "Could you share your iPad model and OS version?"], [false, "iPad Air 5th gen, iPadOS 18."]] },
  { by: "priya", title: "How do I add a teammate?", description: "I cannot find where to invite a new member to our workspace.", category: "OTHER", priority: "LOW", status: "CLOSED", daysAgo: 6,
    thread: [[true, "Go to Settings > Members > Invite. Closing this out, reopen if it does not work."]] },
  { by: "priya", title: "API rate limit is too low for our batch job", description: "We hit 429s at 60 requests per minute during nightly sync.", category: "FEATURE_REQUEST", priority: "MEDIUM", status: "IN_PROGRESS", daysAgo: 1 },
  { by: "demo", title: "Webhook deliveries stopped", description: "No webhook events since yesterday afternoon.", category: "BUG", priority: "URGENT", daysAgo: 0,
    thread: [[false, "Still nothing as of this morning."]] },
  { by: "jordan", title: "Request: SSO for our organisation", description: "We need SAML SSO to meet our security policy.", category: "FEATURE_REQUEST", priority: "HIGH", daysAgo: 3 },
  { by: "priya", title: "Wrong currency on invoices", description: "Invoices show USD but our contract is in EUR.", category: "BILLING", priority: "HIGH", status: "RESOLVED", daysAgo: 4,
    thread: [[true, "Corrected. A re-issued invoice is on its way."]] },
];

async function main() {
  const hash = await argon2.hash(PASSWORD);
  const users: Record<string, AuthUser & { name: string }> = {};
  for (const p of PEOPLE) {
    // An existing account with another role may have self-registered under a seed email: never adopt it.
    const existing = await prisma.user.findUnique({ where: { email: p.email } });
    if (existing && existing.role !== p.role) throw new Error(`${p.email} already exists with role ${existing.role}; refusing to seed`);
    const u = await prisma.user.upsert({
      where: { email: p.email },
      update: { name: p.name, passwordHash: hash },
      create: { email: p.email, name: p.name, role: p.role, passwordHash: hash },
    });
    users[p.email.split("@")[0]!] = { id: u.id, role: u.role, name: u.name };
  }
  const admin = users.admin!;

  if (process.env.SEED_RESET === "1") {
    await prisma.$executeRawUnsafe('TRUNCATE "notifications","event_deliveries","events","comments","tickets" RESTART IDENTITY CASCADE');
  }
  if ((await prisma.ticket.count()) > 0) {
    console.log("Tickets already exist; users ensured. Set SEED_RESET=1 to reseed demo data.");
    return;
  }

  for (const s of TICKETS) {
    const owner = users[s.by]!;
    const t = await createTicket(owner, { title: s.title, description: s.description, category: s.category, priority: s.priority });
    for (const [isAdmin, text] of s.thread ?? []) await addComment(isAdmin ? admin : owner, t.id, { body: text });
    if (s.status && s.status !== "OPEN") await changeStatus(admin, t.id, s.status);

    // Backdate so the dashboard and timelines look lived-in; keep event/comment order stable.
    const created = new Date(Date.now() - s.daysAgo * 86_400_000 - 3_600_000);
    await prisma.ticket.update({ where: { id: t.id }, data: { createdAt: created, updatedAt: new Date(created.getTime() + 3_600_000), ...(s.status === "RESOLVED" ? { resolvedAt: new Date(created.getTime() + 5 * 3_600_000) } : {}) } });
    const evs = await prisma.event.findMany({ where: { ticketId: t.id }, orderBy: { seq: "asc" } });
    for (const [i, e] of evs.entries()) await prisma.event.update({ where: { id: e.id }, data: { createdAt: new Date(created.getTime() + i * 600_000) } });
    await prisma.ticket.update({ where: { id: t.id }, data: { updatedAt: new Date(created.getTime() + 3_600_000) } });
    const cs = await prisma.comment.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: "asc" } });
    for (const [i, c] of cs.entries()) await prisma.comment.update({ where: { id: c.id }, data: { createdAt: new Date(created.getTime() + (i + 1) * 900_000) } });
  }

  await dispatchDue();
  console.log(`Seeded ${PEOPLE.length} users and ${TICKETS.length} tickets. Demo password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
