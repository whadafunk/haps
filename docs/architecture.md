# Architecture

## Product Philosophy

**White-label, single-tenant by design.** One deployment serves one brand.
When sold to a customer they get their own instance, their own domain, their own
branding. Their guests never know another organisation runs the same software.

This is a deliberate choice. Per-organizer branding within a shared deployment
(light multi-tenancy) was considered and rejected: the branding guests actually
care about is the event page itself, not the organiser account behind it.
Per-event themes (a `theme` field on every event) deliver that customisation
without the operational complexity of per-organiser config. If a client needs
a truly isolated brand, they get a separate deployment.

Future multi-tenancy (Phase 5+), if ever needed, means separate deployments
managed by a control plane — each tenant's data is physically isolated.
Never a shared DB with a `tenant_id` on every row.

---

## Three Interfaces

The product has three distinct surfaces, each serving a different audience.

### 1 — Admin interface (`/admin`)

Accessed by users with `role = admin`. Manages the instance itself:

- User management (create/deactivate organizer and member accounts)
- Instance config: name, logo, primary colour, default event theme
- SMTP settings (outbound email for edit links, blasts, reminders)
- Storage settings (local volume vs S3-compatible)
- Feature flags and rate-limit overrides

There is typically one admin per deployment (the operator). The admin can also
do everything an organiser can.

### 2 — Organiser interface (`/dashboard`, `/new-event`, `/event/:slug/edit`)

Accessed by users with `role = organizer` (or `admin`). Creates and manages
events on this instance:

- Create events: title, description, dates, location, cover image, theme
- Receive the secret edit link at creation (shown on screen, emailed if SMTP
  is configured, saved to `localStorage` as a fallback)
- Edit all event fields, change status (draft → published → cancelled/archived)
- View guest list with emails, remove RSVPs, delete comments
- Send update blasts to confirmed attendees

Multiple organisers can coexist on one instance (e.g. a team). They share the
instance branding but each owns their own events and templates.
The organiser dashboard filters to their events only.

### 3 — Guest interface (`/event/:slug`, `/my-events`, `/login`, `/register`)

No account required. Identity comes from a signed cookie (`vsid`) that
persists across visits on the same device.

**Invite link flow** (`/event/:slug?t={token}`):
The attendee token in the URL is validated on first visit and written into the
session. Subsequent visits to the same event on the same device don't need the
token in the URL — the session carries it.

**My Events** (`/my-events`):
Lists all events the session has touched (RSVPed, commented, holds an edit
token). Works without an account. The display name learned from the first RSVP
pre-fills future forms.

**Registration / login (Phase 2)**:
Voluntary upgrade. When a guest registers or logs in, the current session's
history (RSVPs, comments, event access) is merged into the account via an
atomic identity-merge transaction. From that point the account works across
devices — a new device just needs to log in.

### Interface boundaries

```
Admin ──────────── instance config, user management
Organiser ─────── event lifecycle, guest list, blasts
Guest ──────────── view event, RSVP, comment, my-events
                   (optionally upgrade to registered account)
```

All three surfaces use the same REST API (`/api/*`). SvelteKit SSR renders
the guest-facing event pages for correct Open Graph previews.

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
