# Database design

PostgreSQL, managed with Prisma migrations (`server/prisma/schema.prisma`, `server/prisma/migrations/`).

## Entity relationship

```mermaid
erDiagram
  users ||--o{ tickets : "creates"
  users ||--o{ comments : "writes"
  users ||--o{ events : "acts in"
  users ||--o{ notifications : "receives"
  tickets ||--o{ comments : "has"
  tickets ||--o{ events : "produces"
  events ||--o{ event_deliveries : "fans out to"
  events ||--o{ notifications : "causes"

  users { uuid id PK; text email UK; text name; text passwordHash; enum role; timestamp createdAt }
  tickets { uuid id PK; text title; text description; enum category; enum priority; enum status; uuid createdById FK; timestamp createdAt; timestamp updatedAt; timestamp resolvedAt; timestamp deletedAt }
  comments { uuid id PK; uuid ticketId FK; uuid authorId FK; text body; timestamp createdAt }
  events { uuid id PK; int seq UK; enum type; uuid ticketId FK; uuid actorId FK; jsonb payload; timestamp createdAt }
  event_deliveries { uuid id PK; uuid eventId FK; text handler; enum status; int attempts; text lastError; int durationMs; timestamp nextAttemptAt; text leaseToken; timestamp lockedUntil }
  notifications { uuid id PK; uuid userId FK; uuid eventId FK; text title; text body; timestamp readAt; timestamp createdAt }
```

## Tables

| Table | Purpose | Notes |
|---|---|---|
| `users` | Accounts and roles | `email` is unique and stored lower-cased. `passwordHash` is argon2. Role is `USER` or `ADMIN`; admins are only created by the seed script. |
| `tickets` | Support requests | `status` ∈ OPEN, IN_PROGRESS, RESOLVED, CLOSED. `resolvedAt` is set when resolved and kept when closed and cleared on reopen. `deletedAt` implements soft delete. |
| `comments` | Conversation on a ticket | Tied to a ticket and an author. Body is stored verbatim; the client escapes on render. |
| `events` | The event log (outbox) | One row per domain event with a JSON `payload` and actor. `seq` is an auto-increment used for a stable order, because events written in one transaction share a timestamp. This table is also the ticket activity timeline and the Event Inspector source. |
| `event_deliveries` | One row per (event, handler) | Execution record: `status`, `attempts`, `lastError`, `durationMs`, retry schedule (`nextAttemptAt`) and the lease (`leaseToken`, `lockedUntil`). |
| `notifications` | In-app notifications | Unique on `(userId, eventId)`, which makes the notification handler idempotent. |

## Event pipeline (why the schema looks like this)

1. A service changes a ticket and inserts an `events` row plus one `event_deliveries` row per handler **in the same transaction**. Either everything commits or nothing does, so an event can never be lost or invented.
2. The dispatcher claims due deliveries with `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, setting a lease (`leaseToken`, `lockedUntil`) and incrementing `attempts`. Concurrent dispatchers never take the same row.
3. A delivery with an expired lease (the process died mid-run) is reclaimed. Once `attempts` reaches the maximum it becomes `DEAD` instead of looping forever.
4. Completion is conditional on the lease token, so a worker that lost its lease cannot overwrite a newer result.
5. Failures back off exponentially (5s, 10s, 20s, 40s) and end `DEAD`; admins can retry from the Event Inspector.
6. Delivery is at-least-once, so handlers are idempotent: the notification handler relies on the unique `(userId, eventId)` key and the email stub carries `eventId:handler` as its idempotency key.

## Indexes

| Index | Serves |
|---|---|
| `tickets (createdById, createdAt)` | "My tickets" list |
| `tickets (status, priority)` | Admin filters |
| `tickets (createdAt)` | Default sort, 7-day volume |
| `comments (ticketId, createdAt)` | Conversation order |
| `events (ticketId, createdAt)`, `events (type)`, `events (createdAt)`, `events (seq)` unique | Timelines, inspector filters and ordering |
| `event_deliveries (eventId, handler)` unique | One delivery per handler; idempotent fan-out |
| `event_deliveries (status, nextAttemptAt)` | Dispatcher "what is due" scan |
| `notifications (userId, createdAt)`, `(userId, eventId)` unique | Inbox and de-duplication |

## Integrity decisions

- Foreign keys everywhere; UUID primary keys so ids are not guessable or enumerable.
- Soft delete on tickets keeps events, comments and the audit trail intact. Deleted tickets are filtered from every read path.
- Status changes take a row lock (`SELECT ... FOR UPDATE`) so concurrent changes emit events exactly once.
- The transition matrix is enforced in the service: OPEN→{IN_PROGRESS, RESOLVED, CLOSED}; IN_PROGRESS→{OPEN, RESOLVED, CLOSED}; RESOLVED→{OPEN, IN_PROGRESS, CLOSED}; CLOSED→{OPEN}.
- Timestamps are `timestamp(3)` in UTC.

## Trade-offs

- Events and handler runs live in the primary database: no extra infrastructure and atomic writes, at the cost of polling. Fine at this scale; a broker would replace the dispatcher if throughput grew.
- Delivery is at-least-once rather than exactly-once; idempotent handlers make that safe.
- Stats are computed on demand from `tickets`; at larger volumes they would move to a materialised view.
