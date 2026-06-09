import type { Event, Rsvp, Comment } from '@haps/shared'

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function getBase(serverSide: boolean): string {
  if (serverSide && typeof process !== 'undefined') {
    return process.env['INTERNAL_API_URL'] ?? process.env['API_URL'] ?? 'http://localhost:3000'
  }
  return ''
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { serverSide?: boolean } = {},
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const { serverSide = false, ...rest } = options
  const base = getBase(serverSide)
  const isFormData = rest.body instanceof FormData
  const res = await fetchFn(`${base}/api${path}`, {
    ...rest,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(rest.headers ?? {}),
    },
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: 'UNKNOWN', message: res.statusText } }))
    const err = body?.error ?? { code: 'UNKNOWN', message: res.statusText }
    throw new ApiError(res.status, err.code, err.message)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// Server-side load function versions (pass SvelteKit's fetch)
export function createServerApi(fetchFn: typeof fetch, cookie?: string) {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {}

  function get<T>(path: string) {
    return apiFetch<T>(path, { serverSide: true, headers }, fetchFn)
  }
  function post<T>(path: string, body: unknown) {
    return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), serverSide: true, headers }, fetchFn)
  }

  return { get, post }
}

// Client-side API (called from Svelte components)
export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiFetch<{ user: { id: string; email: string; displayName: string; role: string } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  logout: () =>
    apiFetch<void>('/auth/logout', { method: 'POST' }),

  getMe: () =>
    apiFetch<{ id: string; email: string; displayName: string; role: string; subscribed: boolean }>('/auth/me'),

  // Events
  getEvent: (slug: string, token?: string) => {
    const q = token ? `?t=${encodeURIComponent(token)}` : ''
    return apiFetch<{
      event: Event & { guestCount: number; yesCount: number; maybeCount: number }
      myRsvp: { status: string; headCount: number; note?: string | null } | null
      isEditor: boolean
    }>(`/events/${slug}${q}`)
  },

  createEvent: (body: Record<string, unknown>) =>
    apiFetch<{ event: Event; editLink: string; editToken: string }>(
      '/events', { method: 'POST', body: JSON.stringify(body) }),

  updateEvent: (slug: string, body: Record<string, unknown>, editToken?: string) =>
    apiFetch<{ event: Event }>(`/events/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  deleteEvent: (slug: string, editToken?: string) =>
    apiFetch<void>(`/events/${slug}`, {
      method: 'DELETE',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  uploadCover: (slug: string, file: File, editToken?: string) => {
    const form = new FormData()
    form.append('file', file)
    return apiFetch<{ coverImageUrl: string }>(`/events/${slug}/cover`, {
      method: 'POST',
      body: form,
      headers: editToken ? { 'x-edit-token': editToken } : {},
    })
  },

  // RSVPs
  submitRsvp: (slug: string, body: Record<string, unknown>) =>
    apiFetch<{ rsvp: Rsvp }>(`/events/${slug}/rsvps`, { method: 'POST', body: JSON.stringify(body) }),

  updateRsvp: (slug: string, rsvpId: string, body: Record<string, unknown>) =>
    apiFetch<{ rsvp: Rsvp }>(`/events/${slug}/rsvps/${rsvpId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteRsvp: (slug: string, rsvpId: string, editToken?: string) =>
    apiFetch<void>(`/events/${slug}/rsvps/${rsvpId}`, {
      method: 'DELETE',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  listRsvps: (slug: string) =>
    apiFetch<{ rsvps: Array<Rsvp & { email?: string }> }>(`/events/${slug}/rsvps`),

  // Comments
  listComments: (slug: string) =>
    apiFetch<{ comments: Comment[] }>(`/events/${slug}/comments`),

  postComment: (slug: string, body: { displayName: string; body: string }) =>
    apiFetch<{ comment: Comment }>(`/events/${slug}/comments`, { method: 'POST', body: JSON.stringify(body) }),

  deleteComment: (slug: string, commentId: string, editToken?: string) =>
    apiFetch<void>(`/events/${slug}/comments/${commentId}`, {
      method: 'DELETE',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  // Session
  getSession: () =>
    apiFetch<{ session: { displayName: string | null; email: string | null }; events: Array<{ slug: string; title: string; startsAt: string; myStatus: string | null; isEditor: boolean }> }>('/session/me'),

  updateSession: (body: { displayName?: string; email?: string }) =>
    apiFetch<{ session: { displayName: string | null; email: string | null } }>('/session/me', { method: 'PATCH', body: JSON.stringify(body) }),

  // Admin
  listAdminEvents: () =>
    apiFetch<{ events: Array<{ slug: string; title: string; status: string; startsAt: string }> }>('/admin/events'),

  listUsers: () =>
    apiFetch<{ users: Array<{ id: string; email: string; displayName: string; role: string; createdAt: string }> }>('/admin/users'),

  createUser: (body: { email: string; password: string; displayName: string; role: string }) =>
    apiFetch<{ user: { id: string; email: string; displayName: string; role: string } }>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),

  // Setup
  getSetupStatus: () =>
    apiFetch<{ setupRequired: boolean }>('/setup/status'),

  submitSetup: (body: { email: string; password: string; displayName: string }) =>
    apiFetch<{ user: { id: string } }>('/setup', { method: 'POST', body: JSON.stringify(body) }),
}
