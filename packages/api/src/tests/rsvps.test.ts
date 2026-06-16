import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, createOrganizer, createEvent, getSessionCookie, getSessionWithProfile } from './helpers.js'

let app: FastifyInstance
let adminCookies: string
let orgCookies: string
let eventSlug: string
let editToken: string

beforeAll(async () => { app = await getApp() })
afterAll(async () => { await closeApp() })
beforeEach(async () => {
  await truncateAll()
  adminCookies = await setupAdmin(app)
  orgCookies = await createOrganizer(app, adminCookies)
  const created = await createEvent(app, orgCookies, { status: 'published' })
  eventSlug = created.event.slug
  editToken = created.editToken
})

describe('POST /api/events/:slug/rsvps', () => {
  it('creates an RSVP and stores display name on session', async () => {
    // Use a fresh session (no pre-set email) to avoid identity lock
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.rsvp.status).toBe('yes')
  })

  it('upserts (updates) an existing RSVP', async () => {
    // Session with email pre-set — body email must match
    const session = await getSessionWithProfile(app, { email: 'alice@test.com', displayName: 'Alice' })
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'maybe', email: 'alice@test.com' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().rsvp.status).toBe('maybe')
  })

  it('returns 404 for an unknown event', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/events/no-such-event/rsvps',
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when event is not published', async () => {
    const { event } = await createEvent(app, orgCookies) // draft
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('EVENT_NOT_PUBLISHED')
  })
})

describe('GET /api/events/:slug/rsvps', () => {
  it('returns the RSVP list to an editor', async () => {
    // Use a fresh session (no pre-set display name) so the RSVP sets the identity
    const session = await getSessionCookie(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { 'x-edit-token': editToken },
    })
    expect(res.statusCode).toBe(200)
    const rsvps = res.json().rsvps
    expect(rsvps.length).toBe(1)
    expect(rsvps[0].displayName).toBe('Alice')
    expect(rsvps[0].email).toBe('alice@test.com')
  })

  it('returns names only (no email) to the public', async () => {
    const session = await getSessionCookie(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    const res = await app.inject({ method: 'GET', url: `/api/events/${eventSlug}/rsvps` })
    expect(res.statusCode).toBe(200)
    expect(res.json().rsvps[0].email).toBeUndefined()
  })
})

describe('DELETE /api/events/:slug/rsvps/:rsvpId', () => {
  it('owner can delete their own RSVP', async () => {
    const session = await getSessionCookie(app)
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    expect(createRes.statusCode).toBe(201)
    const rsvpId = createRes.json().rsvp.id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${eventSlug}/rsvps/${rsvpId}`,
      headers: { Cookie: session },
    })
    expect(res.statusCode).toBe(204)
  })

  it('editor can remove any RSVP', async () => {
    const session = await getSessionCookie(app)
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'alice@test.com' },
    })
    expect(createRes.statusCode).toBe(201)
    const rsvpId = createRes.json().rsvp.id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${eventSlug}/rsvps/${rsvpId}`,
      headers: { 'x-edit-token': editToken },
    })
    expect(res.statusCode).toBe(204)
  })
})
