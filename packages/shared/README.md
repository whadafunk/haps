# packages/shared

TypeScript types and Zod schemas shared between `packages/api` and `packages/web`.
This is the single source of truth for data shapes. Neither api nor web should
define their own copies of these types.

## Setup:

```bash
cd packages/shared
pnpm init
pnpm add zod
pnpm add -D typescript
```

## package.json name must be:
```json
{ "name": "@haps/shared" }
```

## Structure:

```
src/
  types/
    event.ts       Event, EventStatus, Theme
    rsvp.ts        Rsvp, RsvpStatus
    user.ts        User, UserRole, VisitorSession
    comment.ts     Comment
    token.ts       EventToken, TokenType
  schemas/
    event.ts       CreateEventSchema, UpdateEventSchema (Zod)
    rsvp.ts        CreateRsvpSchema (Zod)
    auth.ts        LoginSchema, RegisterSchema (Zod)
    config.ts      InstanceConfigSchema (Zod)
  index.ts         Re-exports everything
```

## Usage in api:
```typescript
import { CreateEventSchema, type Event } from '@haps/shared'
```

## Usage in web:
```typescript
import type { Event, RsvpStatus } from '@haps/shared'
```
