# Implementation State

Current as of: June 2026, after Phase 1 completion and partial Phase 2 (identity & registration work).

This is a snapshot of what is actually built — routes, tables, pages, patterns.
Refer to the design docs (`architecture.md`, `auth-identity.md`, etc.) for
the intent; refer to this doc to know what exists right now.

---

## Phase Status

| Phase | Status |
|-------|--------|
| Phase 0 — Skeleton | Complete |
| Phase 1 — Core MVP | Complete (83/83 tests passing, Lighthouse 99/100/100/100) |
| Phase 2 — Auth & Engagement | Partially complete (see below) |
| Phase 3+ | Not started |

### Phase 2 — What's done

- User registration (`POST /api/auth/register`, `/register` page)
- Account management (`PATCH /api/auth/me`, `POST /api/auth/change-password`, `/account` page)
- Magic links — cross-device sign-in without password (`POST /api/auth/magic-link`, `/magic-link` page)
- Identity merge — on login/register, prior session RSVPs and event access carry over
- Login merge warning — amber notice when logging in with an anonymous session that has history; two-button choice: merge or discard
- Identity lock — once a session has a display name, all future RSVPs from that session show name + email as read-only locked fields
- Registration guard — guests must RSVP to at least one event before creating an account (upgrade path, not cold signup); toggle in admin config
- Register page inherits identity — display name and email pre-filled from the visitor session
- Clear identity — anonymous nav dropdown includes a "Clear identity" action that wipes the vsid cookie (`POST /api/session/clear`)
- Contacts directory — CRUD contacts, used as address book for invitations
- Event invitations — send invite links to contacts by email or WhatsApp
- Single-use attendee tokens — per-contact tokens that are claimed on first visit
- Per-token QR codes on the manage page
- Guest blocking / removal — soft ban or hard delete from an event
- Admin guests panel — view all guests across all events with per-guest history; "no account" badge on unregistered rows
- `event_type` column — `open` (one shared token, notify-only invites) vs `invite_only` (per-contact single-use tokens)
- Profile gate — anonymous guests must submit `displayName + email` before first RSVP (428 `PROFILE_REQUIRED`)
- Capacity + waitlist — auto-waitlist when event is full; auto-promote on cancellation
- RSVP email mandatory — email field required in RSVP form (not optional)

### Phase 2 — What's still to do

- Web Push opt-in and delivery
- Guest inbox (`notifications` table exists; UI not built)
- SMS reminders via Twilio
- Date polling
- RSVP deadline enforcement
- Custom RSVP questions
- Event duplication / templates
- Check-in QR codes
- Stay-in-touch subscription broadcasts

---

## Database — Tables in Use

14 migrations applied (0000 → 0014).

| Table | Purpose |
|-------|---------|
| `users` | Admins, organizers, registered members |
| `visitor_sessions` | Cookie-based identity for guests; one per browser |
| `events` | Events with all config fields |
| `event_tokens` | Edit + attendee tokens, one-to-many per event |
| `rsvps` | One per session+event or user+event |
| `comments` | Soft-deleted via `deleted_at` |
| `event_messages` | In-app messages and host blasts; soft-deleted |
| `delivery_jobs` | Queued email/SMS sends per message |
| `notifications` | Per-session/user notification inbox (created, UI pending) |
| `instance_config` | Singleton row: instance name, SMTP, default theme, registration guard toggle |
| `email_blocklist` | Blocked email addresses, used when removing guests |
| `contacts` | Organizer address book, linked to `event_tokens.contact_id` |
| `magic_links` | Single-use sign-in tokens, 15-min TTL, SHA-256 hash |

Notable schema details:
- `event_tokens.single_use` + `claimed_by_session_id` — single-use enforcement
- `event_tokens.invite_url` — pre-computed invite URL stored at token creation
- `event_tokens.contact_id` — links a token to the contact it was sent to
- `visitor_sessions.status` — `active | blocked | removed`
- `visitor_sessions.event_access` — JSONB map `{slug: 'attendee' | 'editor'}`
- `events.event_type` — `open | invite_only`
- `events.coordinates`, `dress_code`, `allow_plus_ones`, `max_plus_ones`
- `instance_config.require_rsvp_before_register` — boolean, default true; controls registration guard

---

## API Routes

### Auth (`/api/auth/*`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` | — |
| POST | `/api/auth/logout` | — |
| POST | `/api/auth/register` | — |
| POST | `/api/auth/refresh` | refresh_token cookie |
| GET | `/api/auth/me` | JWT |
| PATCH | `/api/auth/me` | JWT |
| POST | `/api/auth/change-password` | JWT |
| DELETE | `/api/auth/me` | JWT |
| POST | `/api/auth/magic-link` | — |
| POST | `/api/auth/magic-link/verify` | — |

### Events (`/api/events/*`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/events` | organizer/admin JWT |
| GET | `/api/events/:slug` | open or attendee token |
| PATCH | `/api/events/:slug` | edit token |
| DELETE | `/api/events/:slug` | edit token or admin JWT |
| GET | `/api/events/:slug/ics` | — |
| GET | `/api/events/:slug/tokens` | edit token or admin JWT |
| POST | `/api/events/:slug/tokens` | edit token or admin JWT |
| DELETE | `/api/events/:slug/tokens/:tokenId` | edit token or admin JWT |
| POST | `/api/events/:slug/cover` | edit token or admin JWT |
| GET | `/api/events/:slug/directory` | edit token or admin JWT |
| POST | `/api/events/:slug/invitations` | edit token or admin JWT |

### RSVPs

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/events/:slug/rsvps` | attendee token in session / open event |
| PATCH | `/api/events/:slug/rsvps/:rsvpId` | owning session/user or edit token |
| DELETE | `/api/events/:slug/rsvps/:rsvpId` | owning session/user or edit token |
| GET | `/api/events/:slug/rsvps` | edit token for full list; public for names-only |

### Comments

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/events/:slug/comments` | attendee token / open event |
| POST | `/api/events/:slug/comments` | attendee token / open event |
| DELETE | `/api/events/:slug/comments/:commentId` | owner or edit token |

### Messages & Blasts

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/events/:slug/messages` | attendee token / open event |
| POST | `/api/events/:slug/messages` | attendee token / open event |
| POST | `/api/events/:slug/blast` | edit token or organizer JWT |
| DELETE | `/api/events/:slug/messages/:messageId` | owner or edit token |

### Session

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/session/me` | vsid cookie |
| PATCH | `/api/session/me` | vsid cookie |
| POST | `/api/session/profile` | vsid cookie — profile gate submission |
| POST | `/api/session/clear` | vsid cookie — wipes the session cookie (clear identity) |

### Admin (`/api/admin/*`)

| Method | Path |
|--------|------|
| GET | `/api/admin/events` |
| GET/POST | `/api/admin/users` |
| PATCH/DELETE | `/api/admin/users/:userId` |
| GET/PATCH | `/api/admin/config` |
| GET | `/api/admin/guests` |
| GET | `/api/admin/guests/contact/:contactId` |
| GET | `/api/admin/guests/user/:guestId` |
| GET | `/api/admin/guests/session/:guestId` |
| PATCH | `/api/admin/guests/session/:guestId/block` |
| PATCH | `/api/admin/guests/session/:guestId/unblock` |
| DELETE | `/api/admin/guests/session/:guestId` |
| POST | `/api/contacts` |
| PATCH | `/api/contacts/:contactId` |
| DELETE | `/api/contacts/:contactId` |

### Setup & Uploads

| Method | Path |
|--------|------|
| GET | `/api/setup/status` |
| POST | `/api/setup` |
| GET | `/api/uploads/:filename` |

---

## Web Routes

| Route | Has server load | Purpose |
|-------|----------------|---------|
| `/` | Yes | Home / landing |
| `/setup` | Yes | First-run admin setup wizard |
| `/login` | Yes | Staff + member login; "Sign in with email link" entry point |
| `/register` | Yes | New member registration |
| `/logout` | Server only | Clears cookies, redirects |
| `/magic-link` | No | Request a magic sign-in link |
| `/magic-link/verify` | No | Consume the token from the email link |
| `/account` | Yes | Registered user account settings |
| `/my-events` | Yes | Guest event history; register nudge with magic-link entry |
| `/backend` | Yes | Redirect alias → `/admin` |
| `/dashboard` | Yes | Organizer event list |
| `/new-event` | Yes | Event creation form |
| `/event/[slug]` | Yes | Public event page — SSR with OG tags |
| `/event/[slug]/edit` | Yes | Edit page (requires edit token in session or URL) |
| `/event/[slug]/edit/[token]` | Yes | Edit link with token in path (sets session, then redirects) |
| `/admin` | Yes | Admin dashboard |
| `/admin/config` | Yes | Instance config (SMTP, name, theme) |
| `/admin/events` | Yes | All events list |
| `/admin/users` | Yes | User management |
| `/admin/guests` | Yes | Guest directory across all events |
| `/admin/guests/[id]` | Yes | Per-guest profile with event history |

---

## Auth & Middleware

Four decorators registered on the Fastify instance:

| Decorator | Behavior |
|-----------|----------|
| `fastify.authenticate` | Verifies `auth_token` JWT; throws 401 if absent/invalid |
| `fastify.requireRole(role)` | Verifies JWT + checks `user.role`; throws 403 if wrong role |
| `fastify.requireEditToken` | Validates X-Edit-Token header or session-stored edit token via Argon2id |
| `fastify.loadSession` | Always succeeds; populates `request.session` from signed `vsid` cookie |

`loadSession` runs globally on every request. The visitor session is created lazily via `ensureSession(request, reply)` — only when a guest takes a meaningful action (RSVP, comment, token validation), not on every page visit.

**Cookie names:**
- `auth_token` — JWT, 1h TTL, httpOnly, SameSite=Strict
- `refresh_token` — 7d TTL, httpOnly, SameSite=Strict
- `vsid` — session ID (UUID signed with HMAC), 1yr TTL, httpOnly, SameSite=Lax

---

## Token Model

| Token type | Storage | Hash | Notes |
|------------|---------|------|-------|
| Edit token | `event_tokens` (type=edit) | Argon2id | One per event; stored as `invite_url` at creation |
| Attendee token | `event_tokens` (type=attendee) | Argon2id | Many per event; `single_use` flag; claimed via `claimed_by_session_id` |
| Session ID | `vsid` cookie value | HMAC signature | UUID mapped to `visitor_sessions.id` via Fastify signed-cookie |
| JWT | `auth_token` cookie | RS256 signed | Payload: `{ sub: userId, role }` |
| Magic link | `magic_links` | SHA-256 | 15 min TTL, single-use flag |

Raw tokens are never stored or logged. The raw token is returned once at creation, then only the hash lives in the DB.

---

## Key Code Patterns

### Shared schemas
All Zod schemas live in `packages/shared/src/schemas/`. Both API (for validation) and web (for form validation) import from `@haps/shared`. After changing shared, rebuild: `pnpm --filter @haps/shared build`.

### Error format
Every error response is `{ error: { code: string, message: string, details: {} } }`. Throw with `createError(status, 'CODE', 'message')` from `lib/errors.ts`.

### DB access
All queries go through Drizzle's query builder in `services/`. Route handlers call services, never query the DB directly. Never `select *` — always list columns explicitly.

### Profile gate (428 PROFILE_REQUIRED)
Anonymous guests are shown a profile collection form before their first RSVP. The API returns 428 when a guest attempts an action without having submitted `displayName + email`. The web client intercepts 428 and shows the profile form inline. Email is mandatory.

### Identity lock
Once a visitor session has a `display_name` (set via profile gate or first RSVP), subsequent RSVPs from that session inherit the stored name and email as read-only locked fields. The locked identity is derived server-side in the event page load and passed as `lockedIdentity` to the page.

### Login merge warning
When logging in from a browser that already has an anonymous visitor session with history (display name set), the login page shows an amber notice. Two buttons: "Log in and merge" (default — claims the session's RSVPs and comments to the account) or "Log in without merging" (creates a fresh session linked to the user, discards anonymous history). Controlled by `skipMerge` boolean in the login request body.

### Registration guard
`POST /api/auth/register` returns `403 NO_EVENT_HISTORY` when the visitor session has no RSVPs and is not already linked to a user. The guard is skipped when `instance_config.require_rsvp_before_register = false` (toggled in Admin → Config). The `/register` page shows an explanatory banner on 403 and pre-fills name + email from the session.

### Clear identity
Anonymous nav dropdown includes a "Clear identity" button. `POST /api/session/clear` clears the `vsid` cookie and returns 204. The page then invalidates all SvelteKit load functions, resetting the session state. Only visible to unauthenticated visitors.

### Event type semantics
- `open` event: one general attendee token, shared via QR or link. Invite-by-contact sends notification only (no token gating).
- `invite_only` event: per-contact single-use tokens. Guests without a valid token see 403 `TOKEN_REQUIRED`. Event type is locked once the event is published.

### Contact → token flow
When a host invites a contact (`POST /api/events/:slug/invitations`), the API generates an attendee token, sets `contact_id` on it, stores the `invite_url`, and optionally sends an email. The invite URL is the canonical shareable link.

---

## Services & Lib

| File | Purpose |
|------|---------|
| `services/email.ts` | Nodemailer wrapper; reads SMTP config from DB then env fallback; `sendEmail()` / `isSmtpConfigured()` |
| `services/storage.ts` | Local file saves; magic-byte MIME detection; `saveLocalFile()` / `getLocalFileStream()` |
| `lib/crypto.ts` | `generateToken()`, `hashToken()` (Argon2id), `verifyToken()`, `hashPassword()`, `verifyPassword()`, `sha256hex()` |
| `lib/errors.ts` | `AppError` + `createError()` |
| `lib/config.ts` | Zod-validated env: NODE_ENV, DATABASE_URL, SESSION_SECRET, JWT_SECRET, APP_URL, PORT, SMTP_*, STORAGE_* |
| `lib/slug.ts` | `generateSlug()` — nanoid(10) |

---

## Test Coverage

8 test suites, 83 tests, all passing.

| File | Covers |
|------|--------|
| `auth.test.ts` | Login, register (guard + NO_EVENT_HISTORY), magic link, refresh, password change, skipMerge |
| `events.test.ts` | Event CRUD, tokens, invitations, directory, cover upload |
| `rsvps.test.ts` | RSVP creation, updates, profile gate, capacity/waitlist, identity lock |
| `comments.test.ts` | Comment creation, deletion, permissions |
| `session.test.ts` | Session creation, profile submission, my-events |
| `messages.test.ts` | Message posting, blasts, delivery job queuing |
| `admin.test.ts` | User management, guest blocking/removal, contacts, config |
| `setup.test.ts` | First-run setup, admin creation |

Run with: `pnpm --filter api test`
