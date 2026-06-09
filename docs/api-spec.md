# API Specification

Base path: `/api`
All requests and responses are JSON.
Authentication: see @docs/auth-identity.md.

## Conventions

**Error response format (all errors):**
```json
{
  "error": {
    "code": "EVENT_NOT_FOUND",
    "message": "No event found with this slug.",
    "details": {}
  }
}
```

**Auth headers:**
- Admin/organizer routes: JWT in `auth_token` httpOnly cookie (set at login).
- Edit token routes: raw token in `X-Edit-Token` header OR in the URL path.
- Visitor session: `vsid` httpOnly cookie (set automatically on first visit).

**Pagination** (Phase 2+): cursor-based. Responses include `{ data, nextCursor }`.

---

## Auth

### POST /api/auth/login
```
Body:    { email: string, password: string }
Returns: { user: { id, email, displayName, role } }
Sets:    auth_token cookie (JWT, 1h), refresh_token cookie (7d)
Errors:  401 INVALID_CREDENTIALS
```

### POST /api/auth/logout
```
Returns: 204
Clears:  auth_token, refresh_token cookies
```

### POST /api/auth/refresh
```
Reads:   refresh_token cookie
Returns: 200 (new auth_token cookie set)
Errors:  401 TOKEN_EXPIRED
```

### GET /api/auth/me
```
Auth:    JWT required
Returns: { id, email, displayName, role, subscribed }
```

### POST /api/auth/register  (Phase 2)
```
Body:    { email: string, password: string, displayName: string }
Returns: { user: { id, email, displayName, role } }
Effect:  triggers identity merge from current vsid session
Sets:    auth_token + refresh_token cookies
Errors:  409 EMAIL_ALREADY_EXISTS
```

### POST /api/auth/magic-link  (Phase 2)
```
Body:    { email: string }
Returns: 204  (sends magic link email; always 204 to avoid email enumeration)
```

### POST /api/auth/magic-link/verify  (Phase 2)
```
Body:    { token: string }
Returns: { user }
Effect:  links current session to account; sets auth cookies
Errors:  401 INVALID_OR_EXPIRED_TOKEN
```

---

## Events

### POST /api/events
```
Auth:    organizer or admin JWT
Body:    {
  title: string
  description?: string        (markdown)
  location?: string
  startsAt: string            (ISO 8601)
  endsAt?: string
  timezone: string            (IANA)
  theme?: string
  showGuests?: boolean        (default true)
  allowComments?: boolean     (default true)
  maxCapacity?: number
  rsvpDeadline?: string
  expiresAt?: string
}
Returns: {
  event: { id, slug, ... }
  editLink: string            (full URL; only returned at creation)
  editToken: string           (raw token; only returned at creation, never again)
}
```

### GET /api/events/:slug
```
Auth:    none required for public events; attendee token for invite-only
         token via ?t=TOKEN query param or X-Attendee-Token header
Returns: {
  event: { slug, title, description, location, startsAt, endsAt, timezone,
           coverImageUrl, theme, status, showGuests, allowComments,
           maxCapacity, rsvpDeadline, guestCount, yesCount, maybeCount }
  myRsvp: { status, headCount, note } | null   (from vsid session)
  isEditor: boolean                            (true if vsid has edit access)
}
Errors:  404 EVENT_NOT_FOUND
         403 TOKEN_REQUIRED  (invite-only event, no valid token)
```

### PATCH /api/events/:slug
```
Auth:    X-Edit-Token header (or stored in session)
Body:    Partial<event fields above>
Returns: { event: { ... } }
Errors:  403 INVALID_EDIT_TOKEN
```

### DELETE /api/events/:slug
```
Auth:    X-Edit-Token OR admin JWT
Returns: 204
```

### POST /api/events/:slug/duplicate  (Phase 2)
```
Auth:    organizer/admin JWT or X-Edit-Token
Body:    { newStartsAt: string, saveAsTemplate?: boolean, templateName?: string }
Returns: { event: { slug, ... }, editLink, editToken }
```

---

## Tokens

### GET /api/events/:slug/tokens
```
Auth:    X-Edit-Token or admin JWT
Returns: { tokens: [{ id, type, label, revoked, createdAt }] }
         (token_hash is never returned)
```

### POST /api/events/:slug/tokens
```
Auth:    X-Edit-Token or admin JWT
Body:    { type: 'attendee', label?: string }
         (edit tokens cannot be created via API — only one per event, at creation)
Returns: { token: { id, type, label }, rawToken: string }
         (rawToken shown once; never stored in plain text)
```

### DELETE /api/events/:slug/tokens/:tokenId
```
Auth:    X-Edit-Token or admin JWT
Effect:  sets revoked = true; all sessions using this token lose attendee access
Returns: 204
```

---

## RSVPs

### POST /api/events/:slug/rsvps
```
Auth:    valid attendee token in session (or open event)
Body:    {
  displayName: string
  status: 'yes' | 'maybe' | 'no'
  headCount?: number          (default 1)
  note?: string
  email?: string              (optional; used for reminders)
}
Returns: { rsvp: { id, status, headCount, note, createdAt } }
Effect:  upserts (updates if this session/user already has an RSVP)
         if event has maxCapacity and status='yes', checks capacity;
         if full, sets status='waitlist' (Phase 2)
```

### PATCH /api/events/:slug/rsvps/:rsvpId
```
Auth:    must be the owning session/user OR X-Edit-Token
Body:    Partial<{ status, headCount, note }>
Returns: { rsvp: { ... } }
```

### DELETE /api/events/:slug/rsvps/:rsvpId
```
Auth:    must be the owning session/user OR X-Edit-Token
Returns: 204
```

### GET /api/events/:slug/rsvps
```
Auth:    X-Edit-Token or admin JWT (full list with emails)
         OR public (if showGuests=true): returns names + status only, no emails
Returns: { rsvps: [{ id, displayName, status, headCount, note, checkedIn }] }
```

### POST /api/events/:slug/rsvps/:rsvpId/checkin  (Phase 2)
```
Auth:    X-Edit-Token or organizer JWT
Returns: { rsvp: { id, checkedIn: true, checkedInAt } }
```

---

## Comments

### GET /api/events/:slug/comments
```
Auth:    attendee token in session (or open event)
Returns: { comments: [{ id, displayName, body, createdAt }] }
         (soft-deleted comments are omitted)
```

### POST /api/events/:slug/comments
```
Auth:    attendee token in session (or open event)
Body:    { displayName: string, body: string }
Returns: { comment: { id, displayName, body, createdAt } }
```

### DELETE /api/events/:slug/comments/:commentId
```
Auth:    owning session/user OR X-Edit-Token
Effect:  soft delete (sets deleted_at)
Returns: 204
```

---

## Session & My Events

### GET /api/session/me
```
Auth:    vsid cookie
Returns: {
  session: { displayName, email }
  events: [{ slug, title, startsAt, myStatus, isEditor }]
}
```

### PATCH /api/session/me
```
Auth:    vsid cookie
Body:    { displayName?: string, email?: string }
Returns: { session: { displayName, email } }
```

---

## Admin

All routes require admin JWT.

### GET /api/admin/events
```
Returns: { events: [{ slug, title, status, startsAt, yesCount, maybeCount }] }
```

### GET /api/admin/users
```
Returns: { users: [{ id, email, displayName, role, createdAt }] }
```

### POST /api/admin/users
```
Body:    { email, password, displayName, role: 'organizer' | 'member' }
Returns: { user }
```

### DELETE /api/admin/users/:userId
```
Returns: 204
```

### GET /api/admin/config
```
Returns: { config: { instanceName, logoUrl, defaultTheme, smtp: {...},
                     sms: {...}, storage: {...}, featureFlags: {...} } }
```

### PATCH /api/admin/config
```
Body:    Partial<config>
Returns: { config }
```

### POST /api/admin/events/:slug/blast
```
Body:    { subject: string, body: string, channels: ('email'|'sms'|'push')[] }
Returns: { queued: number }  (number of recipients)
```

---

## Update Blasts (Organizer)

### POST /api/events/:slug/blast
```
Auth:    X-Edit-Token or organizer JWT
Body:    { subject: string, body: string, channels: ('email'|'sms'|'push')[] }
Returns: { queued: number }
Note:    Only sends to RSVPs with status='yes' that have provided an email/phone
         and have not unsubscribed.
```

---

## Rate Limits (defaults; configurable via admin config)

| Route                        | Limit              |
|------------------------------|--------------------|
| POST /api/events             | 10/hour per IP     |
| POST /api/events/*/rsvps     | 20/hour per IP     |
| POST /api/events/*/comments  | 30/hour per IP     |
| POST /api/auth/login         | 10/15min per IP    |
| POST /api/auth/magic-link    | 5/hour per IP      |
