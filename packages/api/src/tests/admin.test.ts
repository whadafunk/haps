import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, createOrganizer, createEvent, loginAs } from './helpers.js'

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

describe('GET /api/admin/events', () => {
  it('returns all events for admin', async () => {
    await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events',
      headers: { Cookie: adminCookies },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().events.length).toBeGreaterThan(0)
  })

  it('returns only own events for organizer', async () => {
    await createEvent(app, orgCookies)
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events',
      headers: { Cookie: orgCookies },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().events.length).toBe(1)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/events' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/admin/users', () => {
  it('lists all users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { Cookie: adminCookies },
    })
    expect(res.statusCode).toBe(200)
    const users = res.json().users
    expect(users.some((u: { role: string }) => u.role === 'admin')).toBe(true)
    expect(users.some((u: { role: string }) => u.role === 'organizer')).toBe(true)
  })
})

describe('POST /api/admin/users', () => {
  it('creates an organizer account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { Cookie: adminCookies },
      payload: { email: 'new@test.com', password: 'NewPass123!', displayName: 'New User', role: 'organizer' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().user.role).toBe('organizer')
  })

  it('rejects duplicate email', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { Cookie: adminCookies },
      payload: { email: 'dup@test.com', password: 'Pass123!x', displayName: 'First', role: 'organizer' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { Cookie: adminCookies },
      payload: { email: 'dup@test.com', password: 'Pass123!x', displayName: 'Second', role: 'organizer' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('rejects invalid role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { Cookie: adminCookies },
      payload: { email: 'x@test.com', password: 'Pass123!x', displayName: 'X', role: 'superadmin' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /api/admin/users/:userId', () => {
  it('hard-deletes a user so they can no longer log in', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { Cookie: adminCookies },
      payload: { email: 'todelete@test.com', password: 'DelPass123!', displayName: 'To Delete', role: 'organizer' },
    })
    const userId = createRes.json().user.id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${userId}`,
      headers: { Cookie: adminCookies },
    })
    expect(res.statusCode).toBe(204)

    // Hard-deleted user not found → 401
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'todelete@test.com', password: 'DelPass123!' },
    })
    expect(loginRes.statusCode).toBe(401)
    expect(loginRes.json().error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('GET /api/admin/config', () => {
  it('returns the instance config', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: { Cookie: adminCookies },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().config).toBeTruthy()
  })
})

describe('PATCH /api/admin/config', () => {
  it('updates instance name', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/config',
      headers: { Cookie: adminCookies },
      payload: { instanceName: 'My Haps' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().config.instanceName).toBe('My Haps')
  })
})
