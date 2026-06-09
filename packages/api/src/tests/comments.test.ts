import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, createOrganizer, createEvent, getSessionCookie } from './helpers.js'

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

describe('GET /api/events/:slug/comments', () => {
  it('returns an empty list for a new event', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/events/${eventSlug}/comments` })
    expect(res.statusCode).toBe(200)
    expect(res.json().comments).toEqual([])
  })
})

describe('POST /api/events/:slug/comments', () => {
  it('posts a comment and returns it', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/comments`,
      headers: { Cookie: session },
      payload: { displayName: 'Bob', body: 'Looking forward to it!' },
    })
    expect(res.statusCode).toBe(201)
    const comment = res.json().comment
    expect(comment.displayName).toBe('Bob')
    expect(comment.body).toBe('Looking forward to it!')
    expect(comment.id).toBeTruthy()
  })

  it('returns 403 when comments are disabled', async () => {
    const { event, editToken: et } = await createEvent(app, orgCookies, {
      status: 'published',
      allowComments: false,
    })
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${event.slug}/comments`,
      headers: { Cookie: session },
      payload: { displayName: 'Bob', body: 'Hello' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('COMMENTS_DISABLED')
  })

  it('returns 400 for an empty body', async () => {
    const session = await getSessionCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/comments`,
      headers: { Cookie: session },
      payload: { displayName: 'Bob', body: '' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /api/events/:slug/comments/:commentId', () => {
  it('owner can delete their own comment', async () => {
    const session = await getSessionCookie(app)
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/comments`,
      headers: { Cookie: session },
      payload: { displayName: 'Bob', body: 'To be deleted' },
    })
    const commentId = postRes.json().comment.id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${eventSlug}/comments/${commentId}`,
      headers: { Cookie: session },
    })
    expect(res.statusCode).toBe(204)
    // Soft-deleted: should not appear in list
    const list = await app.inject({ method: 'GET', url: `/api/events/${eventSlug}/comments` })
    expect(list.json().comments).toEqual([])
  })

  it('editor can delete any comment', async () => {
    const session = await getSessionCookie(app)
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/comments`,
      headers: { Cookie: session },
      payload: { displayName: 'Bob', body: 'Delete me' },
    })
    const commentId = postRes.json().comment.id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${eventSlug}/comments/${commentId}`,
      headers: { 'x-edit-token': editToken },
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 403 when a different session tries to delete', async () => {
    const session1 = await getSessionCookie(app)
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/events/${eventSlug}/comments`,
      headers: { Cookie: session1 },
      payload: { displayName: 'Bob', body: 'Mine' },
    })
    const commentId = postRes.json().comment.id
    const session2 = await getSessionCookie(app)
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/events/${eventSlug}/comments/${commentId}`,
      headers: { Cookie: session2 },
    })
    expect(res.statusCode).toBe(403)
  })
})
