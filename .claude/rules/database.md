# Database Conventions (Drizzle ORM + PostgreSQL)

## Schema Location

Single schema file: `packages/api/src/db/schema.ts`
All tables are defined here. Import from this file everywhere.

## Defining Tables

```typescript
import { pgTable, uuid, text, boolean, timestamp, jsonb, integer } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const events = pgTable('events', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug:        text('slug').notNull().unique(),
  organizerId: uuid('organizer_id').notNull().references(() => users.id),
  title:       text('title').notNull(),
  status:      text('status').notNull().default('draft'),
  startsAt:    timestamp('starts_at', { withTimezone: true }).notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // ...
})
```

## Migrations

```bash
# After changing schema.ts:
pnpm --filter api db:generate   # generates a new migration file in src/db/migrations/
pnpm --filter api db:migrate    # applies pending migrations

# Never edit a migration file after it has been applied to any environment.
# Always generate a new migration to fix a previous one.
```

Migrations run automatically at API startup (in `app.ts`, before routes register).
This is safe for the scale we're operating at; switch to a separate migration step
if/when the app scales to a point where zero-downtime deployments require it.

## Query Patterns

**Select specific columns (never `select *`):**
```typescript
const event = await db
  .select({
    id: events.id,
    slug: events.slug,
    title: events.title,
    startsAt: events.startsAt,
  })
  .from(events)
  .where(eq(events.slug, slug))
  .limit(1)
  .then(rows => rows[0] ?? null)
```

**Insert and return:**
```typescript
const [newEvent] = await db.insert(events).values(data).returning()
```

**Upsert (e.g. RSVP):**
```typescript
await db
  .insert(rsvps)
  .values(data)
  .onConflictDoUpdate({
    target: [rsvps.eventId, rsvps.sessionId],
    set: { status: data.status, headCount: data.headCount, updatedAt: new Date() },
  })
```

**Transactions (always for multi-step writes):**
```typescript
await db.transaction(async (tx) => {
  await tx.insert(events).values(eventData)
  await tx.insert(eventTokens).values(tokenData)
})
```

## Naming in Schema vs DB

| In schema.ts (camelCase) | In DB (snake_case) |
|--------------------------|--------------------|
| `organizerId`            | `organizer_id`     |
| `startsAt`               | `starts_at`        |
| `createdAt`              | `created_at`       |

Drizzle handles the mapping automatically. Always use camelCase in TypeScript;
never manually write snake_case column names in queries.

## Timestamps

- All timestamps are `timestamptz` (timezone-aware UTC).
- `createdAt` and `updatedAt` are on every table.
- Update `updatedAt` explicitly on PATCH operations; don't rely on DB triggers
  (Drizzle doesn't generate trigger migrations).

## Soft Deletes

- Comments and media use `deletedAt timestamptz` (soft delete).
- Add `where: isNull(comments.deletedAt)` to every read query on those tables.
- Events use `status = 'archived'` rather than soft delete.
- Hard deletes are only for expired events (run by the expiry job) and
  explicit user data deletion requests (GDPR/right to erasure).

## Connection

```typescript
// packages/api/src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
```

One pool shared across the process. Do not create new connections per request.
