import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, createOrganizer, createEvent, getSessionCookie, getSessionWithProfile, extractCookies, mergeCookies } from './helpers.js'
import { db } from '../db/index.js'
import { users, magicLinks } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { generateToken, sha256hex } from '../lib/crypto.js'

let app: FastifyInstance
let adminCookies: string

beforeAll(async () => { app = await getApp() })
afterAll(async () => { await closeApp() })
beforeEach(async () => {
  await truncateAll()
  adminCookies = await setupAdmin(app)
})

describe('POST /api/auth/login', () => {
  it('returns user and sets auth cookies on valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@test.com', password: 'AdminPass123!' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.email).toBe('admin@test.com')
    expect(body.user.role).toBe('admin')
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(setCookie.some((c) => c.startsWith('auth_token='))).toBe(true)
  })

  it('returns 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@test.com', password: 'WrongPass!' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 401 for unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@test.com', password: 'AdminPass123!' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('returns the authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Cookie: adminCookies },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ email: 'admin@test.com', role: 'admin' })
  })

  it('returns 401 without auth cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears cookies and returns 204', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Cookie: adminCookies },
    })
    expect(res.statusCode).toBe(204)
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(cookies.some((c) => c.includes('auth_token=;'))).toBe(true)
  })
})

describe('POST /api/auth/register', () => {
  it('creates a member account and returns auth cookies', async () => {
    const orgCookies = await createOrganizer(app, adminCookies)
    const { event } = await createEvent(app, orgCookies, { status: 'published' })
    const sessionCookie = await getSessionWithProfile(app)
    await app.inject({
      method: 'POST', url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionCookie },
      payload: { displayName: 'Alice', status: 'yes' },
    })

    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      headers: { Cookie: sessionCookie },
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user.email).toBe('alice@test.com')
    expect(body.user.role).toBe('member')
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(setCookie.some((c) => c.startsWith('auth_token='))).toBe(true)
  })

  it('returns 403 NO_EVENT_HISTORY when session has no RSVPs', async () => {
    const sessionCookie = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      headers: { Cookie: sessionCookie },
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('NO_EVENT_HISTORY')
  })

  it('returns 409 when email already exists', async () => {
    const orgCookies = await createOrganizer(app, adminCookies)
    const { event } = await createEvent(app, orgCookies, { status: 'published' })

    // Session A registers
    const sessionA = await getSessionWithProfile(app)
    await app.inject({
      method: 'POST', url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionA },
      payload: { displayName: 'Alice', status: 'yes' },
    })
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      headers: { Cookie: sessionA },
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })

    // Session B tries to register with the same email
    const sessionB = await getSessionWithProfile(app, { email: 'bob@test.com' })
    await app.inject({
      method: 'POST', url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionB },
      payload: { displayName: 'Bob', status: 'yes' },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      headers: { Cookie: sessionB },
      payload: { email: 'alice@test.com', password: 'OtherPass1!', displayName: 'Alice2' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('returns 400 for a short password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'alice@test.com', password: 'short', displayName: 'Alice' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('merges RSVP from visitor session into new account', async () => {
    const orgCookies = await createOrganizer(app, adminCookies)
    const { event } = await createEvent(app, orgCookies, { status: 'published' })

    // Guest RSVPs with a visitor session
    const sessionCookie = await getSessionWithProfile(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionCookie },
      payload: { displayName: 'Alice', status: 'yes' },
    })

    // Guest registers — session should merge into new account
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { Cookie: sessionCookie },
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })
    expect(regRes.statusCode).toBe(201)
    // Merge original vsid with new auth cookies — browser would carry both
    const newCookies = mergeCookies(sessionCookie, extractCookies(regRes.headers))

    // My-events should now show the RSVP under the account
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/session/me',
      headers: { Cookie: newCookies },
    })
    expect(meRes.json().events.length).toBe(1)
    expect(meRes.json().events[0].slug).toBe(event.slug)
  })

  it('discards duplicate RSVP when user already has one for the same event', async () => {
    const orgCookies = await createOrganizer(app, adminCookies)
    const { event } = await createEvent(app, orgCookies, { status: 'published' })

    // Device A: register after RSVPing (guard requires at least one RSVP)
    const sessionA = await getSessionWithProfile(app)
    await app.inject({
      method: 'POST', url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionA },
      payload: { displayName: 'Alice', status: 'yes' },
    })
    const regRes = await app.inject({
      method: 'POST', url: '/api/auth/register',
      headers: { Cookie: sessionA },
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })
    expect(regRes.statusCode).toBe(201)
    const authCookies = mergeCookies(sessionA, extractCookies(regRes.headers))

    // Device B: independent session RSVPs to the same event
    const sessionB = await getSessionWithProfile(app, { email: 'alice-b@test.com' })
    await app.inject({
      method: 'POST', url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionB },
      payload: { displayName: 'Alice', status: 'maybe' },
    })

    // Login on device B — merge should discard the session RSVP (user already has 'yes')
    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      headers: { Cookie: sessionB },
      payload: { email: 'alice@test.com', password: 'Password123!' },
    })
    expect(loginRes.statusCode).toBe(200)

    const rsvpsRes = await app.inject({
      method: 'GET', url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: authCookies },
    })
    // Only one RSVP should exist (the original 'yes', not the session B 'maybe')
    expect(rsvpsRes.json().rsvps.length).toBe(1)
    expect(rsvpsRes.json().rsvps[0].status).toBe('yes')
  })
})

describe('POST /api/auth/refresh', () => {
  it('issues a new auth_token given a valid refresh_token', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@test.com', password: 'AdminPass123!' },
    })
    const allCookies = extractCookies(loginRes.headers)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: allCookies },
    })
    expect(res.statusCode).toBe(200)
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(cookies.some((c) => c.startsWith('auth_token='))).toBe(true)
  })

  it('returns 401 without a refresh token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/magic-link', () => {
  it('returns 204 for a known email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/magic-link',
      payload: { email: 'admin@test.com' },
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 204 for an unknown email (no enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/magic-link',
      payload: { email: 'nobody@example.com' },
    })
    expect(res.statusCode).toBe(204)
  })

  it('inserts a magic_links row for a known user', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/magic-link',
      payload: { email: 'admin@test.com' },
    })
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@test.com')).limit(1)
    const rows = await db.select({ id: magicLinks.id }).from(magicLinks).where(eq(magicLinks.userId, user.id))
    expect(rows.length).toBe(1)
  })
})

describe('POST /api/auth/magic-link/verify', () => {
  async function insertMagicLink(userId: string, ttlMs = 15 * 60 * 1000) {
    const rawToken = generateToken()
    const tokenHash = sha256hex(rawToken)
    const expiresAt = new Date(Date.now() + ttlMs)
    await db.insert(magicLinks).values({ userId, tokenHash, expiresAt })
    return rawToken
  }

  it('issues auth cookies and returns user on a valid token', async () => {
    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, 'admin@test.com')).limit(1)
    const rawToken = await insertMagicLink(user.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/magic-link/verify',
      payload: { token: rawToken },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.email).toBe('admin@test.com')
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(cookies.some((c) => c.startsWith('auth_token='))).toBe(true)
  })

  it('marks the token as used so it cannot be replayed', async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@test.com')).limit(1)
    const rawToken = await insertMagicLink(user.id)

    await app.inject({ method: 'POST', url: '/api/auth/magic-link/verify', payload: { token: rawToken } })
    const second = await app.inject({ method: 'POST', url: '/api/auth/magic-link/verify', payload: { token: rawToken } })
    expect(second.statusCode).toBe(401)
  })

  it('returns 401 for an expired token', async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@test.com')).limit(1)
    const rawToken = await insertMagicLink(user.id, -1000) // already expired

    const res = await app.inject({ method: 'POST', url: '/api/auth/magic-link/verify', payload: { token: rawToken } })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/magic-link/verify', payload: { token: 'bogus-token-value' } })
    expect(res.statusCode).toBe(401)
  })

  it('merges visitor session into the account on verify', async () => {
    const orgCookies = await createOrganizer(app, adminCookies)
    const { event } = await createEvent(app, orgCookies, { status: 'published' })

    // Guest RSVPs on a visitor session
    const sessionCookie = await getSessionWithProfile(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionCookie },
      payload: { displayName: 'Bob', status: 'yes' },
    })

    // Guest requests magic link and verifies it (session carries forward)
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@test.com')).limit(1)
    const rawToken = await insertMagicLink(user.id)
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/magic-link/verify',
      headers: { Cookie: sessionCookie },
      payload: { token: rawToken },
    })
    expect(verifyRes.statusCode).toBe(200)

    const newCookies = mergeCookies(sessionCookie, extractCookies(verifyRes.headers))
    const meRes = await app.inject({ method: 'GET', url: '/api/session/me', headers: { Cookie: newCookies } })
    expect(meRes.json().events.some((e: { slug: string }) => e.slug === event.slug)).toBe(true)
  })
})
