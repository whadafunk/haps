# Architecture

## Product Philosophy

**The app IS the organizer.** One instance, one brand, one organizer identity.
No discovery layer, no public event listing by default, no cross-organizer
network. When sold to a customer, they get their own instance, their own domain,
their own branding. Their users never know another organization runs the same
software. This is a white-label model, not a multi-tenant platform.

Future multi-tenancy (Phase 4+) means separate deployments managed by a control
plane — each tenant's data is physically isolated. Not shared-DB with a
tenant_id on every row.

---

## System Diagram

```
                    ┌─────────────────────────────────────┐
  Browser / App ──▶│  Caddy (TLS termination, reverse proxy)│
                    └────────────┬───────────┬─────────────┘
                                 │           │
                    ┌────────────▼──┐  ┌─────▼────────────┐
                    │  SvelteKit    │  │  Fastify API      │
                    │  (SSR + SPA)  │  │  /api/*           │
                    │  port 5173    │  │  port 3000        │
                    └───────────────┘  └────────┬──────────┘
                                                │
                    ┌───────────────────────────▼──────────┐
                    │  PostgreSQL 16                        │
                    └──────────────────────────────────────┘
                    ┌───────────────────────────────────────┐
                    │  File storage                         │
                    │  local volume (default) or S3-compat  │
                    └───────────────────────────────────────┘
```

**Caddy** handles TLS automatically (Let's Encrypt). Routes:
- `/*` → SvelteKit (SSR for event pages, SPA for app shell)
- `/api/*` → Fastify

**SvelteKit** handles two things:
1. Server-side rendering of event pages (for Open Graph tags and fast first load)
2. The client-side SPA for all interactive app flows

**Fastify** is the sole API layer. It owns all DB access. SvelteKit's SSR load
functions call the Fastify API (not the DB directly) — this keeps one auth
boundary and makes the mobile app a first-class citizen of the same API.

---

## Monorepo Structure (pnpm workspaces)

```
haps/
├── CLAUDE.md
├── CLAUDE.local.md          (gitignored; personal dev notes)
├── .claude/
│   └── rules/               (per-layer coding conventions)
├── docs/                    (this folder)
├── packages/
│   ├── api/                 Fastify backend
│   │   ├── src/
│   │   │   ├── routes/      one file per resource group
│   │   │   ├── middleware/  auth, rate-limit, error handler
│   │   │   ├── db/          Drizzle schema + migrations
│   │   │   ├── services/    business logic (no DB queries here)
│   │   │   └── lib/         token, email, storage utilities
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── web/                 SvelteKit frontend
│   │   ├── src/
│   │   │   ├── routes/      file-based routing
│   │   │   ├── lib/         shared components, stores, API client
│   │   │   └── app.html
│   │   ├── Dockerfile
│   │   └── package.json
│   └── shared/              Types + Zod schemas used by both api and web
│       ├── src/
│       │   ├── types/       TypeScript interfaces
│       │   └── schemas/     Zod schemas (single source of truth for validation)
│       └── package.json
├── docker-compose.yml
├── Caddyfile
├── .env.example
└── package.json             (workspace root)
```

---

## Key Technical Decisions

### Why Fastify over Express
Fastify has built-in TypeScript support, a schema-validation hook that integrates
with Zod/JSON Schema, and measurably better throughput. For a new project there
is no reason to choose Express.

### Why SvelteKit over Next.js
For this use case (public event pages that need great SSR + OG tags, plus an
interactive app shell), SvelteKit's server-side `load()` model is simpler than
Next.js's App Router. Smaller bundle, less boilerplate. The tradeoff: slightly
smaller ecosystem — acceptable here.

### Why SvelteKit calls the API rather than the DB
The mobile app (Phase 4) uses the same API. Giving SvelteKit direct DB access
would create two auth paths, two data-access patterns, and make the API
incomplete for mobile. Slightly more latency in SSR (one extra HTTP call) is
the right tradeoff.

### Why Drizzle over Prisma
Drizzle is type-safe, SQL-close, and has no Prisma Client binary or generation
step. Migrations are plain SQL files managed by Drizzle Kit. Easier to
understand what queries are actually being run.

### Why argon2id for tokens
bcrypt has a max input length of 72 bytes. Argon2id has no such limit and is
the current recommended password hashing algorithm (OWASP). Used for all
stored secrets (passwords, token hashes).

### SQLite "tiny mode"
Set `DATABASE_URL=sqlite:./data/app.db` to run without a Postgres container.
Drizzle supports both dialects from the same schema. Useful for local testing
and very small deployments. Not recommended for production with concurrent
writes.

---

## Deployment (Docker Compose, on-prem)

The canonical deployment is `docker compose up` from the project root.

```
Services:
  db      postgres:16-alpine
  api     ./packages/api     (Dockerfile: node:22-alpine, pnpm build + start)
  web     ./packages/web     (Dockerfile: node:22-alpine, pnpm build + start)
  proxy   caddy:2-alpine
```

**First-run sequence:**
1. `db` starts and passes healthcheck.
2. `api` starts; Drizzle migrations run automatically on startup.
3. API detects no admin user → sets `SETUP_REQUIRED=true` in a DB config row.
4. `web` starts.
5. Any request to the web redirects to `/setup` until setup is complete.
6. Operator fills in admin email + password → setup complete.

**Storage:**
- Uploaded files go to a Docker named volume (`uploads`) mounted at `/uploads`
  inside the API container.
- To use S3-compatible storage, set `STORAGE_TYPE=s3` and `S3_*` env vars.
  The API streams uploads directly to S3; the volume is unused.

**TLS:**
- Caddy handles it automatically via Let's Encrypt if `APP_URL` starts with
  `https://` and the domain resolves to the server.
- For local/intranet use, set `APP_URL=http://localhost` and Caddy serves HTTP.

---

## Security Posture

- All cookies: `httpOnly`, `SameSite=Strict` (auth), `SameSite=Lax` (session),
  `Secure` in production.
- CSRF: SameSite cookies + the custom `X-Edit-Token` header (not a cookie)
  provide CSRF protection without a token.
- Tokens at rest: argon2id hash only. The raw token is shown once and
  never logged.
- Input validation: every API route validates with Zod before any DB access.
  Unknown fields are rejected.
- Rate limiting: per-IP token bucket on all write endpoints (see api-spec.md).
- Content: user-supplied markdown is rendered with a strict allowlist
  (no raw HTML, no iframes, no scripts).
- Images: served through the API (not directly from volume) so auth can be
  checked if event is private; content-type sniffing disabled.
- Dependency updates: Dependabot (or equivalent) configured from day one.

---

## Background Jobs

Phase 1 keeps it simple: a periodic job runs inside the API process on startup
and on a cron schedule.

- **Expiry job**: every hour, delete events where `expires_at < now()`.
- **Reminder job** (Phase 2): 24h before event, send reminders to confirmed RSVPs.
- **Waitlist job** (Phase 2): when a `yes` RSVP is deleted and `max_capacity`
  is set, promote the first waitlisted RSVP and notify them.
- **Digest job** (Phase 3): N hours after event ends, generate host digest.

Use `node-cron` inside the API process for Phase 1. Move to a proper job queue
(BullMQ + Redis) if job volume justifies it in later phases.
