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

describe('GET /api/events/:slug/messages', () => {
  it('returns empty list for a new event', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/events/${eventSlug}/messages` })
    expect(res.statusCode).toBe(200)
    expect(res.json().messages).toEqual([])
  })
})

describe('POST /api/events/:slug/messages', () => {
  it('allows a yes RSVP to post', async () => {
    const session = await getSessionWithProfile(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'guest@test.com' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/messages`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', body: 'So excited!' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().message.body).toBe('So excited!')
    expect(res.json().message.type).toBe('message')
  })

  it('allows a maybe RSVP to post', async () => {
    const session = await getSessionWithProfile(app, { email: 'bob@test.com' })
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Bob', status: 'maybe', email: 'bob@test.com' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/messages`,
      headers: { Cookie: session },
      payload: { displayName: 'Bob', body: 'Might come!' },
    })
    expect(res.statusCode).toBe(201)
  })

  it('rejects a session with no RSVP', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/messages`,
      headers: { Cookie: session },
      payload: { displayName: 'Nobody', body: 'I should not post' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('RSVP_REQUIRED')
  })

  it('allows a no-RSVP session to post if they are editor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/messages`,
      headers: { 'x-edit-token': editToken },
      payload: { displayName: 'Host', body: 'Welcome everyone!' },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('POST /api/events/:slug/blast', () => {
  it('creates a blast message and queues 0 jobs when no channels selected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/blast`,
      headers: { 'x-edit-token': editToken },
      payload: { subject: 'Big news', body: 'The venue changed!', channels: [] },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().queued).toBe(0)
  })

  it('queues email delivery jobs for yes RSVPs with email', async () => {
    // Create two yes RSVPs with emails
    for (const name of ['Alice', 'Bob']) {
      const session = await getSessionWithProfile(app, { email: `${name.toLowerCase()}@test.com` })
      await app.inject({
        method: 'POST',
        url: `/api/events/${eventSlug}/rsvps`,
        headers: { Cookie: session },
        payload: { displayName: name, status: 'yes', email: `${name.toLowerCase()}@test.com` },
      })
    }
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/blast`,
      headers: { 'x-edit-token': editToken },
      payload: { subject: 'Update', body: 'Details changed.', channels: ['email'] },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().queued).toBe(2)
  })

  it('queues 1 job for a yes RSVP with email', async () => {
    const session = await getSessionWithProfile(app, { email: 'withmail@test.com' })
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'WithEmail', status: 'yes', email: 'withmail@test.com' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/blast`,
      headers: { 'x-edit-token': editToken },
      payload: { subject: 'Update', body: 'Body', channels: ['email'] },
    })
    expect(res.json().queued).toBe(1)
  })

  it('blast appears in the messages feed', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/blast`,
      headers: { 'x-edit-token': editToken },
      payload: { subject: 'Heads up', body: 'Party moved to 8pm', channels: [] },
    })
    const res = await app.inject({ method: 'GET', url: `/api/events/${eventSlug}/messages` })
    const messages = res.json().messages
    expect(messages.length).toBe(1)
    expect(messages[0].type).toBe('blast')
    expect(messages[0].subject).toBe('Heads up')
  })

  it('returns 403 for non-editor', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/blast`,
      headers: { Cookie: session },
      payload: { subject: 'Hack', body: 'spam', channels: [] },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('DELETE /api/events/:slug/messages/:messageId', () => {
  it('editor can delete any message', async () => {
    const session = await getSessionWithProfile(app)
    await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/rsvps`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', status: 'yes', email: 'guest@test.com' },
    })
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/messages`,
      headers: { Cookie: session },
      payload: { displayName: 'Alice', body: 'Delete me' },
    })
    const msgId = postRes.json().message.id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${eventSlug}/messages/${msgId}`,
      headers: { 'x-edit-token': editToken },
    })
    expect(res.statusCode).toBe(204)
    const list = await app.inject({ method: 'GET', url: `/api/events/${eventSlug}/messages` })
    expect(list.json().messages).toEqual([])
  })
})
