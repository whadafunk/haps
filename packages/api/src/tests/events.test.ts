import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, createOrganizer, createEvent, getSessionCookie } from './helpers.js'

let app: FastifyInstance
let adminCookies: string
let orgCookies: string

beforeAll(async () => { app = await getApp() })
afterAll(async () => { await closeApp() })
beforeEach(async () => {
  await truncateAll()
  adminCookies = await setupAdmin(app)
  orgCookies = await createOrganizer(app, adminCookies)
})

describe('POST /api/events', () => {
  it('creates an event and returns editToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { Cookie: orgCookies },
      payload: {
        title: 'Summer Party',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        timezone: 'UTC',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.event.slug).toBeTruthy()
    expect(body.editToken).toBeTruthy()
    expect(body.editLink).toContain(body.editToken)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { title: 'X', startsAt: new Date().toISOString(), timezone: 'UTC' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 for member role', async () => {
    // Create a member user
    await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { Cookie: adminCookies },
      payload: { email: 'member@test.com', password: 'MemberPass1!', displayName: 'Member', role: 'member' },
    })
    const memberCookies = await (await import('./helpers.js')).loginAs(app, 'member@test.com', 'MemberPass1!')
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { Cookie: memberCookies },
      payload: { title: 'X', startsAt: new Date().toISOString(), timezone: 'UTC' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { Cookie: orgCookies },
      payload: { title: 'No timezone' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/events/:slug', () => {
  it('returns event details', async () => {
    const { event } = await createEvent(app, orgCookies, { status: 'published' })
    const res = await app.inject({ method: 'GET', url: `/api/events/${event.slug}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().event.slug).toBe(event.slug)
  })

  it('returns 404 for unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events/does-not-exist' })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /api/events/:slug', () => {
  it('updates event fields with a valid edit token', async () => {
    const { event, editToken } = await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.slug}`,
      headers: { 'x-edit-token': editToken },
      payload: { title: 'Updated Title', status: 'published' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().event.title).toBe('Updated Title')
  })

  it('returns 403 with an invalid edit token', async () => {
    const { event } = await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.slug}`,
      headers: { 'x-edit-token': 'invalid-token' },
      payload: { title: 'Hack' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('organizer JWT can update their own event', async () => {
    const { event } = await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.slug}`,
      headers: { Cookie: orgCookies },
      payload: { title: 'JWT Updated' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('DELETE /api/events/:slug', () => {
  it('deletes an event with a valid edit token', async () => {
    const { event, editToken } = await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${event.slug}`,
      headers: { 'x-edit-token': editToken },
    })
    expect(res.statusCode).toBe(204)
    const check = await app.inject({ method: 'GET', url: `/api/events/${event.slug}` })
    expect(check.statusCode).toBe(404)
  })
})

describe('Event tokens', () => {
  it('lists tokens for an event', async () => {
    const { event, editToken } = await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'GET',
      url: `/api/events/${event.slug}/tokens`,
      headers: { 'x-edit-token': editToken },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().tokens)).toBe(true)
  })

  it('creates an attendee token', async () => {
    const { event, editToken } = await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/tokens`,
      headers: { 'x-edit-token': editToken },
      payload: { type: 'attendee', label: 'general' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().token.inviteUrl).toBeTruthy()
  })

  it('revokes an attendee token', async () => {
    const { event, editToken } = await createEvent(app, orgCookies)
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/tokens`,
      headers: { 'x-edit-token': editToken },
      payload: { type: 'attendee', label: 'general' },
    })
    const tokenId = createRes.json().token.id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${event.slug}/tokens/${tokenId}`,
      headers: { 'x-edit-token': editToken },
    })
    expect(res.statusCode).toBe(204)
  })
})

describe('GET /api/events/:slug/ics', () => {
  it('returns an iCal file', async () => {
    const { event } = await createEvent(app, orgCookies, { status: 'published' })
    const res = await app.inject({ method: 'GET', url: `/api/events/${event.slug}/ics` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/calendar')
  })
})
