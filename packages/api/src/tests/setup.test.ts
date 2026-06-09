import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll } from './helpers.js'

let app: FastifyInstance

beforeAll(async () => { app = await getApp() })
afterAll(async () => { await closeApp() })
beforeEach(async () => { await truncateAll() })

describe('GET /api/setup/status', () => {
  it('returns setupRequired true when no admin exists', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/setup/status' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ setupRequired: true })
  })

  it('returns setupRequired false after admin is created', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { email: 'admin@test.com', password: 'AdminPass123!', displayName: 'Admin' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/setup/status' })
    expect(res.json()).toMatchObject({ setupRequired: false })
  })
})

describe('POST /api/setup', () => {
  it('creates the first admin user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { email: 'admin@test.com', password: 'AdminPass123!', displayName: 'Admin' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user.email).toBe('admin@test.com')
    expect(body.user.role).toBe('admin')
  })

  it('rejects a second setup attempt', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { email: 'admin@test.com', password: 'AdminPass123!', displayName: 'Admin' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { email: 'admin2@test.com', password: 'AdminPass123!', displayName: 'Admin2' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('SETUP_ALREADY_COMPLETE')
  })

  it('rejects weak passwords', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { email: 'admin@test.com', password: 'short', displayName: 'Admin' },
    })
    expect(res.statusCode).toBe(400)
  })
})
