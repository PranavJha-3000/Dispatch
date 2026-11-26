# Dispatch: Design

Date: 2026-11-26. Submission due: 2026-11-27 EOD; target completion: today.
Source of truth: `Assignment.pdf` (Full Stack Developer technical assignment, Support Ticket Management System).

## Intent

Dispatch is a helpdesk where users raise tickets and admins resolve them. It is a recruiter-facing submission, so it must read as a production-grade SaaS product. Evaluation (PDF §8) is weighted to backend architecture, API design, DB design, auth/authz, security, error handling, documentation and testing. Visual polish is a differentiator, not a scored criterion, but the owner wants it uncompromised.

Inspirations: Linear (polish), Plain (support experience), incident.io (event observability).

## Goals

- Every mandatory requirement in the PDF (§3 functional, §4 events, §5 technical, §7 submission).
- Persistent, reliable event handling that is visible in the UI (Event Inspector).
- Role-based access with no privilege escalation or cross-user data leaks.
- Automated tests on auth, authorization, ticket rules and the event pipeline.
- Live deployment, README, API docs, DB design write-up.

## Non-goals

Redis, Kafka, RabbitMQ, microservices, real email delivery, websockets, file attachments, ticket assignment workflows, SLA timers, theme switching.

## Anti-goals (failure even if it "works")

- Events only in an in-memory `EventEmitter` (lost on crash, nothing real to inspect).
- A generic AI-template UI; two unrelated design languages.
- Business logic inside route handlers; authorization checked only in the frontend.
- A deployment link that is dead or unseeded on review day.

## Constraints

- Node.js + Express + TypeScript backend; Postgres; React frontend (PDF §2).
- One working day. Scope is cut in favour of backend quality.
- Free-tier hosting (Render + Neon).

## Approaches considered (events)

| | Approach | Verdict |
|---|---|---|
| A | `EventEmitter` only | Rejected by owner: not durable, nothing to inspect. |
| **B** | **Transactional outbox in Postgres + in-process dispatcher** | **Chosen** (owner approved). |
| C | Postgres job-queue library (pg-boss / graphile-worker) | Rejected: library owns the tables, harder inspector, less to explain. |

## Architecture

Modular monolith, one deployable. Express serves the JSON API under `/api` and the built Vite app from the same origin (no CORS, no cross-site cookies). One Docker image.

Backend modules (each with `routes`, `controller`, `service`, `schema` (Zod), repository via Prisma): `auth`, `users`, `tickets`, `comments`, `events`, `notifications`, `stats`. Shared: `middleware` (auth, role guard, validate, error handler, rate limit), `config`, `db`.

Layering rule: routes parse and validate, services hold business rules and authorization, Prisma is touched only from services/repositories. Errors are typed `AppError`s mapped to a consistent JSON shape `{ error: { code, message, details? } }`.

## Event pipeline (Approach B)

1. A service performs the domain change and inserts an `events` row **in the same DB transaction**.
2. After commit, the in-process dispatcher is nudged. It claims pending deliveries and runs handlers.
3. Handlers: `activity` (timeline marker), `notification` (in-app row for the relevant party), `email` (stub that logs; swappable).
4. Each handler run is an `event_deliveries` row: `status` (PENDING, SUCCEEDED, FAILED, DEAD), `attempts`, `last_error`, `duration_ms`, `next_attempt_at`.
5. A poller (interval) claims due rows with `SELECT ... FOR UPDATE SKIP LOCKED`, retries with exponential backoff up to a max, then marks DEAD. Handlers are idempotent (unique key on `(event_id, handler)`).
6. Event types: `TICKET_CREATED`, `TICKET_UPDATED`, `STATUS_CHANGED`, `COMMENT_ADDED`, `TICKET_RESOLVED`. Resolving emits both `STATUS_CHANGED` and `TICKET_RESOLVED`.
7. Event payloads are JSON with `actor`, `ticketId`, and a diff where relevant. Payloads must not contain secrets.

**Event Inspector** (admin): read-only list/detail over `events` + `event_deliveries`: type, actor, timestamp, payload, per-handler status, attempts and error; filter by type/status; manual retry of a failed/dead delivery. Optional stretch: live tail over SSE.

## Data model (Postgres, Prisma)

- `users`: id, email (unique, lowercased), name, password_hash, role (`USER`|`ADMIN`), created_at.
- `tickets`: id, title, description, category (enum), priority (`LOW`..`URGENT`), status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), created_by, created_at, updated_at, resolved_at, deleted_at (soft delete).
- `comments`: id, ticket_id, author_id, body, created_at.
- `events`: id, type, ticket_id (nullable), actor_id, payload (jsonb), created_at.
- `event_deliveries`: id, event_id, handler, status, attempts, last_error, duration_ms, next_attempt_at, updated_at; unique `(event_id, handler)`.
- `notifications`: id, user_id, event_id, title, body, read_at, created_at.

Indexes: tickets by `(created_by)`, `(status, priority)`, `created_at`; comments by `ticket_id`; events by `(ticket_id, created_at)`, `type`; deliveries by `(status, next_attempt_at)`. The ticket activity timeline is a query over `events`, not a separate table.

## Authentication and authorization

- Register creates only `USER`. Admins come from a seed script (demo accounts documented in the README). No endpoint can set a role.
- Passwords hashed with argon2 (bcrypt if install friction). JWT (short expiry) in an httpOnly, Secure, SameSite=Lax cookie; logout clears it.
- Login rate-limited; generic "invalid credentials" message (no user enumeration). Helmet, request body size limit, Zod validation on every input, parameterized queries via Prisma.
- Authorization lives in services: users see/edit/delete/comment only on their own tickets; admins can view and manage all. A user touching another user's ticket gets 404 (not 403) to avoid leaking existence.
- Users may edit a ticket's title/description/category/priority and delete it only while it is `OPEN`; users cannot change status. Admins change status and priority. Soft delete; deleted tickets are hidden from users and admins' default lists.

## REST API (outline; OpenAPI/Postman delivered)

- `POST /api/auth/register|login|logout`, `GET /api/auth/me`
- `GET/POST /api/tickets`, `GET/PATCH/DELETE /api/tickets/:id` (list supports `status`, `priority`, `q`, `sort`, `page`, `limit`; scoped by role)
- `PATCH /api/tickets/:id/status` (admin)
- `GET/POST /api/tickets/:id/comments`
- `GET /api/tickets/:id/activity`
- `GET /api/admin/events`, `GET /api/admin/events/:id`, `POST /api/admin/event-deliveries/:id/retry` (admin)
- `GET /api/admin/stats` (admin dashboard counts)
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`
- Plus `GET /api/health`.

## Frontend

React + Vite + TypeScript, Tailwind, shadcn/ui (Radix) as the component base, Geist font, Lucide icons, TanStack Query, React Router, restrained Framer Motion for micro-interactions.

One design system (obsidian surfaces, subtle violet accent) with two layouts:
- **Admin:** split-pane command center: ticket queue with filters, ticket detail with conversation and activity timeline, stats dashboard, Event Inspector.
- **User:** calmer, roomier portal: ticket list, create ticket, conversation thread, status tracker, notifications.

Role-based route guards in the client are a UX aid only; the API enforces access.

## Testing

Vitest + Supertest against a real Postgres (test database, migrated per run). Must cover: registration cannot create admins; role guards; users cannot read/modify others' tickets; ticket rule enforcement (edit/delete only while OPEN); validation errors; each of the five events written transactionally; dispatcher success, failure, retry and dead-letter; idempotency. A thin frontend smoke check at the end (manual or Playwright) if time allows.

## Delivery

Dockerfile + `docker-compose` for local Postgres; Render (web service) + Neon (database); migrations and seed run on deploy; deploy an early skeleton first so the live link is never the last task. README covers setup, stack, decisions, demo credentials; docs cover DB design and API.

## Decided by the owner

Modular monolith; DB-backed events (outbox); no Redis/Kafka/RabbitMQ/microservices; uncompromised visual fidelity; same-day completion; same-origin single deployment.

## My calls (flag to override)

TypeScript; Prisma (raw SQL only for the delivery claim); argon2; cookie JWT; soft delete; 404 for foreign tickets; users cannot change status; Resolved emits two events; email handler is a logging stub; shadcn/ui as UI base; Vite instead of Next.

## Left to the builder

Exact enum values for categories, handler retry limits and backoff curve, component-level visual details, pagination defaults, seed data content, and file layout inside the module boundaries above.
