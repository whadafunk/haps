import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { db } from '../db/index.js'
import { sql } from 'drizzle-orm'

let _app: FastifyInstance | null = null

export async function getApp(): Promise<FastifyInstance> {
  if (!_app) {
    _app = await buildApp()
  }
  return _app
}

export async function closeApp(): Promise<void> {
  if (_app) {
    await _app.close()
    _app = null
  }
}

export async function truncateAll(): Promise<void> {
  await db.execute(sql`
    TRUNCATE delivery_jobs, event_messages, comments, rsvps, event_tokens, events, visitor_sessions, users
    RESTART IDENTITY CASCADE
  `)
}

/** Extract cookies from a set-cookie header into a Cookie request string */
export function extractCookies(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie']
  if (!raw) return ''
  const arr = Array.isArray(raw) ? (raw as string[]) : [String(raw)]
  return arr.map((c) => c.split(';')[0]).join('; ')
}

/** Merge two cookie strings (second takes precedence for same name) */
export function mergeCookies(existing: string, incoming: string): string {
  if (!incoming) return existing
  if (!existing) return incoming
  const map = new Map<string, string>()
  for (const pair of existing.split('; ')) {
    const [k, v] = pair.split('=')
    if (k) map.set(k, v ?? '')
  }
  for (const pair of incoming.split('; ')) {
    const [k, v] = pair.split('=')
    if (k) map.set(k, v ?? '')
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/** Create an admin user via the setup endpoint and return admin cookies */
export async function setupAdmin(
  app: FastifyInstance,
  opts: { email?: string; password?: string; displayName?: string } = {},
): Promise<string> {
  const email = opts.email ?? 'admin@test.com'
  const password = opts.password ?? 'AdminPass123!'
  const displayName = opts.displayName ?? 'Test Admin'

  await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { email, password, displayName },
  })

  return loginAs(app, email, password)
}

/** Login and return the full cookie string (auth_token + vsid) */
export async function loginAs(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  })
  if (res.statusCode !== 200) {
    throw new Error(`Login failed: ${res.body}`)
  }
  return extractCookies(res.headers)
}

/** Create an organizer user and return their cookies */
export async function createOrganizer(
  app: FastifyInstance,
  adminCookies: string,
  opts: { email?: string; password?: string } = {},
): Promise<string> {
  const email = opts.email ?? 'org@test.com'
  const password = opts.password ?? 'OrgPass123!'

  await app.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: { Cookie: adminCookies },
    payload: { email, password, displayName: 'Test Organizer', role: 'organizer' },
  })

  return loginAs(app, email, password)
}

/** Create an event and return { event, editToken, editLink }.
 *  Accepts `status` as a separate override — it is patched after creation
 *  because CreateEventSchema is strict and does not include status. */
export async function createEvent(
  app: FastifyInstance,
  cookies: string,
  overrides: Record<string, unknown> = {},
) {
  const { status, ...createFields } = overrides

  const res = await app.inject({
    method: 'POST',
    url: '/api/events',
    headers: { Cookie: cookies },
    payload: {
      title: 'Test Event',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      timezone: 'UTC',
      ...createFields,
    },
  })
  if (res.statusCode !== 201) throw new Error(`createEvent failed: ${res.body}`)
  const data = res.json() as { event: { slug: string; id: string }; editToken: string; editLink: string }

  if (status && status !== 'draft') {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/events/${data.event.slug}`,
      headers: { 'x-edit-token': data.editToken },
      payload: { status },
    })
    if (patchRes.statusCode !== 200) throw new Error(`createEvent status patch failed: ${patchRes.body}`)
  }

  return data
}

/** Get a visitor session cookie by hitting GET /api/session/me which calls ensureSession */
export async function getSessionCookie(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/api/session/me' })
  return extractCookies(res.headers)
}
