# Haps

Self-hosted, on-premises party and event invitation platform. Single-organizer,
single-tenant, white-label by design. No account required to view an event or
RSVP — identity comes from invite tokens, persisted via cookie. Registration is
a voluntary upgrade that preserves history across devices.

## Stack

| Layer        | Choice                                   |
|--------------|------------------------------------------|
| Backend      | Node.js 22 LTS · Fastify · TypeScript    |
| Frontend     | SvelteKit · TypeScript                   |
| Database     | PostgreSQL 16                            |
| ORM          | Drizzle ORM                              |
| Reverse proxy| Caddy 2                                  |
| Packages     | pnpm workspaces                          |
| Containers   | Docker + docker compose                  |

## Monorepo Layout

```
packages/api      Fastify REST API (port 3000)
packages/web      SvelteKit SSR frontend (port 5173)
packages/shared   TypeScript types + Zod schemas shared across api and web
```

## Commands

```bash
pnpm install                      # install all workspaces
pnpm --filter api dev             # API dev server with hot reload
pnpm --filter web dev             # Web dev server
pnpm --filter api db:generate     # generate Drizzle migration files
pnpm --filter api db:migrate      # apply migrations to DB
pnpm --filter api db:studio       # open Drizzle Studio (local DB explorer)
docker compose up --build         # full stack: Postgres + API + Web + Caddy
docker compose up db              # Postgres only (for local dev without docker)
```

## Core Principles

1. **No forced accounts.** Guests and editors operate via secret tokens + cookies.
   Registration is an opt-in upgrade path, never a gate.
2. **SSR on all event pages.** Required for correct Open Graph link previews —
   the single most visible piece of polish. SvelteKit server-side `load()`
   functions must populate og:title, og:description, og:image on every event
   route.
3. **Tokens are hashed at rest.** Edit and attendee tokens are high-entropy
   random strings (32 bytes, URL-safe base64). Store only the Argon2id hash.
   Compare using constant-time functions. Never log raw tokens.
4. **Validate everything with Zod.** All API inputs (body, query, params) go
   through a Zod schema before touching the DB. Reject unknown fields
   (`z.object().strict()`).
5. **Mobile-first UI.** Design narrow (375px) first. Widen from there.
6. **Plumbing before polish.** Complete the current phase before touching the
   next. See @docs/features-roadmap.md.

## Docs — read the relevant doc before coding a feature

@docs/architecture.md        System design, deployment model, key decisions
@docs/auth-identity.md       Auth tiers, cookie identity, registration, identity merge
@docs/data-model.md          Full DB schema with annotations
@docs/api-spec.md            REST endpoint reference with request/response shapes
@docs/features-roadmap.md    Phased feature list — check phase before starting

## Rules — coding conventions per layer

@.claude/rules/api.md        Fastify patterns, error format, middleware
@.claude/rules/frontend.md   SvelteKit patterns, OG tags, form conventions
@.claude/rules/database.md   Drizzle ORM conventions, migration workflow
@.claude/rules/security.md   Token handling, cookies, rate limiting, validation

## Current Phase

**Phase 1 — Core MVP.** See @docs/features-roadmap.md.
Do not build Phase 2+ features until Phase 1 is complete and all routes have
integration tests passing.
