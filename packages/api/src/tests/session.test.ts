import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, createOrganizer, createEvent, getSessionCookie, extractCookies } from './helpers.js'

let app: FastifyInstance

beforeAll(async () => { app = await getApp() })
afterAll(async () => { await closeApp() })
beforeEach(async () => { await truncateAll() })

describe('GET /api/session/me', () => {
  it('returns empty session for a fresh visitor', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/session/me',
      headers: { Cookie: session },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.session).toBeTruthy()
    expect(body.events).toEqual([])
  })

  it('lists events that the session has RSVPed to', async () => {
    const adminCookies = await setupAdmin(app)
    const orgCookies = await createOrganizer(app, adminCookies)
    const { event } = await createEvent(app, orgCookies, { status: 'published' })

    const session = await getSessionCookie(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/session/me',
      headers: { Cookie: session },
    })
    expect(res.json().events.length).toBe(1)
    expect(res.json().events[0].slug).toBe(event.slug)
  })
})

describe('PATCH /api/session/me', () => {
  it('updates display name', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/session/me',
      headers: { Cookie: session },
      payload: { displayName: 'New Name' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().session.displayName).toBe('New Name')
  })

  it('updates email', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/session/me',
      headers: { Cookie: session },
      payload: { email: 'updated@test.com' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().session.email).toBe('updated@test.com')
  })

  it('rejects an invalid email', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/session/me',
      headers: { Cookie: session },
      payload: { email: 'not-an-email' },
    })
    expect(res.statusCode).toBe(400)
  })
})
