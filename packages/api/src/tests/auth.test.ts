import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, truncateAll, setupAdmin, extractCookies } from './helpers.js'

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
