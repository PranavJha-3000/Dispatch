# Dispatch

An event-driven support ticket system. Customers raise and follow tickets; admins triage them from a split-pane command center; every change is recorded as a durable event whose delivery to handlers (notifications, email) you can inspect and retry.

**Live demo:** https://dispatch-fzst.onrender.com (free tier: the first request after idle can take ~50 s to wake) · **API docs:** `/api/docs` (Swagger UI) · **Postman:** [`docs/dispatch.postman_collection.json`](docs/dispatch.postman_collection.json) · **DB design:** [`docs/database.md`](docs/database.md)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@dispatch.dev` | `Dispatch#2026` |
| Customer | `demo@dispatch.dev` | `Dispatch#2026` |

Registration always creates a customer. Admins exist only through the seed script.

## Stack

Node 24 · Express 5 · TypeScript · PostgreSQL via Prisma · Zod · JWT (httpOnly cookie) · argon2 · Vitest + Supertest (real Postgres) · React 19 · Vite · Tailwind 4 · TanStack Query · Radix · Docker.

A modular monolith: the API serves the built SPA same-origin, so there is one deployable, one origin and no CORS.

## Run it

```bash
npm install
npm run db:start -w server        # embedded Postgres on :5433; keeps running, so use its own terminal (or point DATABASE_URL at any Postgres and skip this)
cp server/.env.example server/.env
npm run db:deploy -w server       # apply migrations
npm run db:seed -w server         # demo users and tickets
npm run dev -w server             # API on :3000
npm run dev -w web                # UI on :5173 (proxies /api)
```

Or with Docker: `docker compose up --build`, then `docker compose exec app npx tsx prisma/seed.ts` and open http://localhost:3000.

Seeding a hosted database (e.g. Render + Neon): from `server/`, run `NODE_ENV=production SEED_PASSWORD=<pw> DATABASE_URL=<url> npx tsx prisma/seed.ts` (add `SEED_RESET=1` to wipe tickets and reseed).

Tests: `npm test` (spins up its own Postgres; 80 tests). Typecheck: `npm run typecheck`.

Environment: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars), `PORT`, `WEB_DIST` (serve the SPA from this folder), `SEED_PASSWORD` (required to seed in production).

## How the event pipeline works

Ticket Created, Ticket Updated, Status Changed, Comment Added and Ticket Resolved are first-class events.

1. A service function changes data and calls `recordEvent(tx, …)` **inside the same transaction**. The ticket change, the `events` row and one `event_deliveries` row per handler commit together or not at all (a transactional outbox). There is no window where a change exists without its event.
2. A dispatcher claims due deliveries with `FOR UPDATE SKIP LOCKED`, takes a time-limited lease, and runs the handler. A crashed worker's lease expires and the delivery is reclaimed.
3. Failures retry with exponential backoff (5 s · 2ⁿ), up to 5 attempts, then go to `DEAD`. Completion is conditional on the lease token, so a slow worker can't overwrite a newer one.
4. Handlers are idempotent: `notifications` has a unique `(userId, eventId)` and the email stub carries the idempotency key `eventId:handler`, so retries and duplicate runs never double-notify.
5. The **Event Inspector** (admin) reads this same data: payload, actor, timestamps and per-handler status, attempts and errors, with a retry button. The per-ticket activity timeline is a read over `events`; it needs no handler.

Notifications: the actor is never notified; a new ticket notifies admins; an admin reply or status change notifies the owner; a customer reply notifies admins; resolving notifies the owner once.

## Security

- Passwords hashed with argon2; unknown-email logins still do a dummy verify to keep timing even.
- JWT (HS256, 1 h) in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The role is read from the database on every request, never trusted from the token.
- CSRF: every state-changing request must carry `X-Requested-With: dispatch`, and a present `Origin` must match the host.
- Authorization lives in the API. Another user's, a deleted or a malformed-id ticket returns **404**, not 403, so existence isn't leaked. Customers cannot change status; they edit or delete only while a ticket is Open (soft delete). Admins can change status and priority and reply to any ticket.
- Failed-login limiter (per IP and account) and a sign-up limiter; Helmet headers; 100 kB body limit; Zod validation on every input; a uniform error shape `{ error: { code, message, details? } }`.
- Concurrent status changes take a row lock, so a double resolve emits one Status Changed and one Ticket Resolved.
- A test-only fault-injection switch (`FAIL_HANDLER`) is ignored in production, and the app refuses to boot if it is set there.

## Layout

```
server/src/modules/{auth,tickets,comments,events,notifications,stats}/   routes → service → Prisma
server/src/{middleware,config,errors,db}.ts
server/prisma/                schema, migration, seed
server/test/                  integration tests against real Postgres
web/src/{pages,components,layouts,api,hooks}/
docs/                         openapi.yaml, Postman, database.md, design spec and plan
```

## Decisions and trade-offs

- **Postgres outbox over EventEmitter, Redis or Kafka.** Events must survive crashes and be inspectable, and Postgres already guarantees the atomicity needed. The cost is polling latency (sub-second via an in-process nudge) and a single-region design.
- **Same-origin SPA with cookie auth** rather than tokens in `localStorage`, to keep the credential away from page scripts.
- **Email is a stub** that records the intended message and idempotency key. Swapping in a real provider is a change inside one handler.
- Not built, deliberately: websockets (the UI polls), file attachments, multi-tenancy.
