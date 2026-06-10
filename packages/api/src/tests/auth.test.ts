import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, createOrganizer, createEvent, getSessionCookie, extractCookies, mergeCookies } from './helpers.js'

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
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user.email).toBe('alice@test.com')
    expect(body.user.role).toBe('member')
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(setCookie.some((c) => c.startsWith('auth_token='))).toBe(true)
  })

  it('returns 409 when email already exists', async () => {
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
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
    const sessionCookie = await getSessionCookie(app)
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

    // Register first on device A (no session activity)
    const regRes = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'alice@test.com', password: 'Password123!', displayName: 'Alice' },
    })
    const authCookies = extractCookies(regRes.headers)

    // RSVP as logged-in user from device A
    await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: authCookies },
      payload: { displayName: 'Alice', status: 'yes' },
    })

    // Login on device B which has an independent session RSVP for the same event
    const sessionB = await getSessionCookie(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: sessionB },
      payload: { displayName: 'Alice', status: 'maybe' },
    })

    // Login on device B — merge should discard the session RSVP (user already has one)
    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      headers: { Cookie: sessionB },
      payload: { email: 'alice@test.com', password: 'Password123!' },
    })
    expect(loginRes.statusCode).toBe(200)

    const rsvpsRes = await app.inject({
      method: 'GET',
      url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: authCookies },
    })
    // Only one RSVP should exist (the original 'yes', not the session 'maybe')
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
