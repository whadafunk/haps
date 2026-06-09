# Security Rules

These are non-negotiable. Do not trade them away for convenience.

## Tokens

```typescript
// ALWAYS generate tokens like this:
import { randomBytes } from 'crypto'
const rawToken = randomBytes(32).toString('base64url')  // 43 chars, URL-safe

// ALWAYS hash before storing:
import argon2 from 'argon2'
const hash = await argon2.hash(rawToken, { type: argon2.argon2id })

// ALWAYS compare with constant-time equality:
import { timingSafeEqual } from 'crypto'
const incoming = await argon2.hash(rawTokenFromRequest, { type: argon2.argon2id })
// Note: argon2.verify() already handles timing safety:
const valid = await argon2.verify(storedHash, rawTokenFromRequest)

// NEVER:
// - store raw tokens in DB
// - log raw tokens
// - put raw tokens in query strings that get logged (URL path is fine for edit links,
//   but use X-Edit-Token header for API calls)
// - compare with == or ===
```

## Cookies

All cookies must be set with:
```typescript
reply.setCookie('auth_token', jwt, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',    // 'strict' for auth cookies
  path: '/',
  maxAge: 60 * 60,       // 1 hour for JWT
})

reply.setCookie('vsid', sessionId, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',       // 'lax' allows cookie on top-level nav (invite links)
  path: '/',
  maxAge: 60 * 60 * 24 * 365,  // 1 year
  signed: true,          // use @fastify/cookie signing
})
```

## Input Validation

Every route with a body, query, or params **must** validate with Zod before
touching the DB:

```typescript
const Schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  startsAt: z.string().datetime(),
}).strict()   // .strict() rejects unknown fields — always use it on body schemas
```

Validation errors return 400 with the Zod error formatted through the error handler.
Never pass unvalidated request data to a DB query.

## Markdown Rendering

User-supplied markdown is rendered with a strict allowlist. Use `marked` +
`DOMPurify` (or `sanitize-html` on the server) with:
- No raw HTML passthrough (`allowedTags` whitelist only)
- No `<script>`, `<iframe>`, `<object>`, `<embed>`
- No `javascript:` URLs
- Allowed: headers, paragraphs, lists, bold, italic, links (http/https only),
  blockquotes, code blocks

## Rate Limiting

Use `@fastify/rate-limit`. Apply per-route; do not rely on a global limit alone.
See api-spec.md for per-route limits. Key rules:
- Write endpoints (POST, PATCH, DELETE) always rate-limited by IP.
- Auth endpoints (login, magic link) have tighter limits than content endpoints.
- Return `429 Too Many Requests` with a `Retry-After` header.
- In development (`NODE_ENV !== 'production'`), rate limits can be disabled
  via an env flag to avoid friction during testing.

## File Uploads

- Validate MIME type server-side (not just the file extension or Content-Type
  header — read the first bytes to verify).
- Allowed types for Phase 3: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Max file size: configurable via admin config; default 10MB.
- Generate a random filename on upload; never use the user-supplied filename
  as the storage path.
- Serve uploaded files through the API, not directly from the volume/S3.
  This allows auth checks for private event media.

## Environment Variables

- All secrets (JWT_SECRET, SESSION_SECRET, etc.) must be non-empty at startup.
  Fail fast with a clear error if any required secret is missing or still the
  placeholder value from `.env.example`.
- Minimum entropy check: secrets shorter than 32 characters should log a
  startup warning.
- Never log the value of any secret or credential.

## SQL Injection

Drizzle's query builder parameterizes all values automatically.
If you ever write a raw SQL query (e.g. with `db.execute(sql`...`)`), use
the `sql` tagged template literal — never string interpolation.

```typescript
// Safe:
db.execute(sql`SELECT * FROM events WHERE slug = ${slug}`)

// NEVER:
db.execute(`SELECT * FROM events WHERE slug = '${slug}'`)
```
