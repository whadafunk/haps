# Features & Roadmap

## Phase 0 — Skeleton (½ day)

Project scaffolding, nothing user-facing.

- [ ] pnpm monorepo with `packages/api`, `packages/web`, `packages/shared`
- [ ] TypeScript configured in all three packages with shared `tsconfig.base.json`
- [ ] Fastify skeleton with `/health` endpoint
- [ ] SvelteKit skeleton with a single placeholder route
- [ ] Drizzle config pointing to Postgres
- [ ] `docker-compose.yml` with Postgres, API, Web, Caddy
- [ ] `.env.example` with all required vars documented
- [ ] ESLint + Prettier configured across workspaces
- [ ] GitHub Actions (or equivalent): lint, typecheck, test on push

---

## Phase 1 — Core MVP

The first shippable product. A host can create an event, share a link, collect
RSVPs, and manage the guest list from any device.

**Event management**
- [ ] Organizer creates event: title, description (markdown), start/end datetime
      + timezone, location (free text), cover image upload, theme selector
- [ ] Event has a public `slug` and a secret `editToken`
- [ ] Host receives edit link at creation (shown on screen + emailed if SMTP
      configured); edit link persists in a `localStorage` fallback + cookie
- [ ] Host can edit any event field via the edit link
- [ ] Host can delete or archive an event via the edit link
- [ ] Event status: `draft` (not yet shared) → `published` → `cancelled` / `archived`
- [ ] Configurable auto-expiry: delete event N days after end date

**Public event page (SSR required)**
- [ ] Renders event details, cover image, themed background
- [ ] Open Graph tags: og:title, og:description, og:image (rendered server-side)
- [ ] `.ics` download link
- [ ] "Add to Google Calendar" link

**RSVP**
- [ ] Guest submits RSVP: display name, status (yes / maybe / no), optional
      email, head count, optional note
- [ ] One RSVP per visitor session per event (update in place on resubmit)
- [ ] Guest list visible on event page (host can toggle visibility per event)
- [ ] Host can remove any RSVP via edit link

**Comments**
- [ ] Guest posts a comment with display name + text
- [ ] Host can delete any comment via edit link
- [ ] Comments can be disabled per event

**Cookie-based visitor identity**
- [ ] On first visit, create a `visitor_session` and set a signed httpOnly cookie
- [ ] "My events" page at `/my-events`: shows all events linked to the session
      (events where the session has RSVPed, commented, or holds an edit token)
- [ ] Session carries a `display_name` learned from the guest's first RSVP
      (pre-fills name on subsequent RSVPs)

**Organizer tools**
- [ ] Organizer login (email + password → JWT stored in httpOnly cookie)
- [ ] Organizer dashboard: list all events, status, RSVP count
- [ ] Update blast: organizer sends a message to all `yes` RSVPs via email
      (requires SMTP; degrades gracefully if SMTP not configured)

**Admin config**
- [ ] Admin login (same flow as organizer; role = `admin`)
- [ ] Config page: instance name, logo, default theme, SMTP settings,
      SMS settings, storage settings, feature flags
- [ ] First-run setup: if no admin exists, redirect to setup wizard

**Quality bar for Phase 1 completion**
- [x] All routes have integration tests (Vitest + supertest) — 68/68 passing
- [x] Mobile layout passes on 375px viewport
- [x] Lighthouse score ≥ 90 on event page (SSR) — performance 99 · accessibility 100 · best-practices 100 · SEO 100
- [x] `docker compose up` produces a working app from a clean machine

---

## Phase 2 — Auth & Engagement

Voluntary registration, cross-device persistence, pre-event features.

**Registration & identity**
- [ ] User registration: email + password → creates `users` record with
      `role = member`
- [ ] Identity merge: on registration, all prior session history (RSVPs,
      comments, event access) is claimed under the new account
- [ ] Login links the new device's session cookie to the existing account
- [ ] Email-based cross-device recovery: guest enters email → gets a magic
      link → new device session is linked to their account

**Stay-in-touch**
- [ ] Registered users can subscribe to organizer updates (opt-in toggle
      in account settings)
- [ ] Organizer can broadcast an announcement to all subscribers via
      email and/or push notification

**Pre-event planning**
- [ ] Date polling: host creates a set of proposed dates; guests vote;
      host picks a winner and it becomes the event date
- [ ] RSVP deadline: host sets a cutoff; RSVP form closes automatically
- [ ] Capacity + waitlist: cap at N; overflow guests are waitlisted;
      auto-promote when a yes RSVP is removed
- [ ] Custom RSVP questions: host adds questions (text / single-select /
      multi-select); answers stored per RSVP

**Communication**
- [ ] SMS reminders via Twilio (optional; off unless TWILIO_* env vars set)
- [ ] Web Push notifications (no external service required; browser prompt
      on My Events page)
- [ ] Reminder jobs: 7 days, 2 days, and 1 day before the event; sent to
      all `yes`/`maybe` RSVPs via all enabled channels (email, SMS)

**Organizer tools**
- [ ] Event duplication → optionally save as a reusable template
- [ ] Template library: organizer picks a template when creating an event
- [ ] Check-in QR code: each RSVP generates a unique QR; host scans at
      the door; marks `checked_in = true`

**People directory (guest history)**
- [ ] Organizer view of all guests across all events on this instance
- [ ] Per-person profile: display name, email, phone (if provided),
      first seen date, and a list of every event they RSVPed to with their
      response (yes / maybe / no) and attendance status
- [ ] Guest identity: a person is identified by their visitor session
      (cookie) on first event visit; if they later register, their history
      merges into their account. Unregistered guests are identifiable by
      display name + email if provided.
- [ ] Design note: a visitor session is only created when a user first
      loads an event invitation link — not on a bare visit to the home page
      or marketing pages. This keeps anonymous browsing truly anonymous.

**Invitations**

Four invitation channels, all sharing the same link type (single-use token for
invite-only events, general token for open events). The Invite links card on the
manage page already shows the UI skeleton for all four; backend delivery is Phase 2.

- [ ] **Link** (manual): already works — generate/copy link, share outside the app.
      Invite-only events get per-guest single-use tokens with a "Manage" modal.
- [ ] **Email**: host enters recipient name + email → system generates a token,
      sends a branded invite email via SMTP with the personalised link.
- [ ] **WhatsApp**: host enters recipient phone → system generates a token, opens
      `wa.me/?text=...` deep link with invite message pre-filled; host taps Send.
      No Meta Business API needed — uses the consumer WhatsApp deep link.
- [ ] **In-app**: drops a notification row in the guest's inbox (requires guest
      inbox / notifications table from Phase 2 to exist first).
- [ ] Delivery tracking per invitation per channel: sent, delivered, failed,
      bounced — visible to the organizer on the event guest list.
- [ ] Address book: stored per-organizer; auto-populated from past event
      guest emails/phones (with guest opt-in).

---

## Phase 3 — Memories

Post-event experience; turns the app into a place people return to.

- [ ] Event memories wall: a chronological stream of photos and short
      messages (thoughts), visible after the event starts
- [ ] Wall is attendee-only by default (configurable per event)
- [ ] Media uploads: photos (and optionally short videos); stored on
      configured storage backend (local volume or S3-compatible)
- [ ] Host moderation: delete any post from the wall
- [ ] Host digest: after event ends, auto-generate a downloadable archive
      (PDF summary + zip of all uploaded photos + captions)
- [ ] Wall visibility on "My events" page: past events link directly to
      their wall

**Photo Archive**

Persistent album browsing after an event ends or is archived. Distinct
from deletion: archiving an event preserves its photos; deleting removes
them from disk (already implemented in Phase 1 fix).

- [ ] Archival intent: when an organizer sets status = 'archived', album
      photos are preserved on disk (not cleaned up). Deletion is still the
      path that removes files.
- [ ] Operator archive view (`/admin/archive`): grid of all archived
      events with their albums. Per-event: photo count, download ZIP,
      delete individual photos, toggle public access.
- [ ] Guest archive page (`/archive/[slug]`): browsable photo grid for a
      single archived event. Access mirrors the live event — public albums
      are open to anyone; invite-only albums require an attendee token in
      session (same check as the live event page, no new auth needed).
- [ ] "My Events" links: past/archived events link to `/archive/[slug]`
      instead of the live event page once the event is archived.
- [ ] Public archive index (`/archive`): optional page listing all events
      with public albums, organised by date. Toggled per-event by the
      organizer. Off by default.

---

## Phase 4 — Mobile & White-label

- [ ] React Native / Expo mobile app using the same REST API
- [ ] Deep linking: invite links open in the app if installed
- [ ] Push via APNs / FCM (replaces Web Push for mobile)
- [ ] White-label config: logo, primary color, app name configurable at
      deploy time via environment variables
- [ ] White-label mobile build: single codebase, per-customer config at
      build time

---

## Phase 5 — Optional / Future

Evaluated based on real usage after Phase 3.

- [ ] Webhooks: POST to a configured URL on event lifecycle events
      (event.created, rsvp.added, event.started, etc.)
- [ ] Calendar sync: two-way Google Calendar / Outlook integration
- [ ] Organizer analytics dashboard: RSVP conversion, open rates, etc.
- [ ] Paid events: Stripe integration for ticketing
- [ ] Multi-tenant management layer (separate deployment; manages N instances)
