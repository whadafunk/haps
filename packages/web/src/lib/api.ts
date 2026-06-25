import type { Event, Rsvp, Post, AlbumPhoto } from '@haps/shared'

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

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { serverSide?: boolean } = {},
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const { serverSide = false, ...rest } = options
  const base = getBase(serverSide)
  const isFormData = rest.body instanceof FormData
  const hasJsonBody = !isFormData && rest.body !== undefined && rest.body !== null
  const res = await fetchFn(`${base}/api${path}`, {
    ...rest,
    headers: {
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    credentials: 'include',
  })

  // Client-side JWT expiry: attempt a silent token refresh on 401, then retry once.
  // On server-side calls we skip this — the layout load handles expiry by deleting the cookie.
  if (res.status === 401 && !serverSide && typeof window !== 'undefined') {
    const refreshed = await fetchFn(`${base}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshed.ok) {
      // Retry the original request with the new token (cookie is now updated)
      const retry = await fetchFn(`${base}/api${path}`, {
        ...rest,
        headers: {
          ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
          ...(rest.headers ?? {}),
        },
        credentials: 'include',
      })
      if (retry.ok) {
        if (retry.status === 204) return undefined as T
        return retry.json()
      }
      const retryBody = await retry.json().catch(() => ({ error: { code: 'UNKNOWN', message: retry.statusText } }))
      const retryErr = retryBody?.error ?? { code: 'UNKNOWN', message: retry.statusText }
      throw new ApiError(retry.status, retryErr.code, retryErr.message)
    } else {
      // Refresh failed — navigate to /logout so the server clears stale cookies and
      // the layout re-renders with user: null
      window.location.href = '/logout'
      return undefined as T
    }
  }

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
  login: (email: string, password: string, skipMerge?: boolean) =>
    apiFetch<{ user: { id: string; email: string; displayName: string; role: string } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password, ...(skipMerge ? { skipMerge: true } : {}) }) }),

  logout: () =>
    apiFetch<void>('/auth/logout', { method: 'POST' }),

  getMe: () =>
    apiFetch<{ id: string; email: string; displayName: string; role: string; subscribed: boolean }>('/auth/me'),

  updateProfile: (body: { displayName: string }) =>
    apiFetch<{ user: { id: string; email: string; displayName: string; role: string } }>(
      '/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiFetch<void>('/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),

  getMyGuestIdentity: () =>
    apiFetch<{ contact: { id: string; name: string; email: string; phone: string | null; instagramHandle: string | null; avatarUrl: string | null; bio: string | null; vibe: string | null } }>('/auth/me/guest'),

  setupGuestIdentity: (body: { displayName: string; email: string; phone?: string; instagramHandle?: string; bio?: string; vibe?: string }) =>
    apiFetch<{ contact: { id: string; name: string; email: string; phone: string | null; instagramHandle: string | null; avatarUrl: string | null; bio: string | null; vibe: string | null } }>('/auth/me/guest', { method: 'POST', body: JSON.stringify(body) }),

  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiFetch<{ avatarUrl: string }>('/auth/me/avatar', { method: 'POST', body: form })
  },

  // Deprecated aliases kept for backward compat
  getContact: () =>
    apiFetch<{ contact: { id: string; name: string; email: string; phone: string | null; instagramHandle: string | null; avatarUrl: string | null; bio: string | null; vibe: string | null } }>('/auth/me/guest'),

  setupContact: (body: { displayName: string; email: string; phone?: string; instagramHandle?: string; bio?: string; vibe?: string }) =>
    apiFetch<{ contact: { id: string; name: string; email: string; phone: string | null; instagramHandle: string | null; avatarUrl: string | null; bio: string | null; vibe: string | null } }>('/auth/me/guest', { method: 'POST', body: JSON.stringify(body) }),

  deleteAccount: () =>
    apiFetch<void>('/auth/me', { method: 'DELETE' }),

  register: (body: { email: string; password: string; displayName: string }) =>
    apiFetch<{ user: { id: string; email: string; displayName: string; role: string } }>(
      '/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  requestMagicLink: (email: string) =>
    apiFetch<void>('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) }),

  verifyMagicLink: (token: string) =>
    apiFetch<{ user: { id: string; email: string; displayName: string; role: string } }>(
      '/auth/magic-link/verify', { method: 'POST', body: JSON.stringify({ token }) }),

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

  listTokens: (slug: string, editToken: string) =>
    apiFetch<{ tokens: Array<{ id: string; type: string; label: string | null; status: string; singleUse: boolean; inviteUrl: string | null; claimedBySessionId: string | null; createdAt: string }> }>(
      `/events/${slug}/tokens`, { headers: { 'x-edit-token': editToken } }),

  createToken: (slug: string, body: { type: 'attendee'; label?: string; singleUse?: boolean }, editToken?: string) =>
    apiFetch<{ token: { id: string; type: string; label: string | null; singleUse: boolean; inviteUrl: string | null } }>(
      `/events/${slug}/tokens`, { method: 'POST', body: JSON.stringify(body), headers: editToken ? { 'x-edit-token': editToken } : {} }),

  deleteToken: (slug: string, tokenId: string, editToken?: string) =>
    apiFetch<void>(`/events/${slug}/tokens/${tokenId}`, {
      method: 'DELETE',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  listDirectory: (slug: string, editToken: string) =>
    apiFetch<{ contacts: Array<{ id: string; name: string; email: string | null; phone: string | null; instagramHandle: string | null }> }>(
      `/events/${slug}/directory`, { headers: { 'x-edit-token': editToken } }),

  bulkInvite: (slug: string, contactIds: string[], channels: string[], editToken?: string) =>
    apiFetch<{ invitations: Array<{ contactId: string; contactName: string; tokenId: string; inviteLink: string; emailSent: boolean; whatsappUrl: string | null }> }>(
      `/events/${slug}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ contactIds, channels }),
        headers: editToken ? { 'x-edit-token': editToken } : {},
      }),

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
    apiFetch<{ rsvps: Array<Rsvp & { email?: string; guestId?: string | null; isHost?: boolean; profile: { avatarUrl: string | null; bio: string | null; vibe: string | null } | null }> }>(`/events/${slug}/rsvps`),

  // Wall posts
  listPosts: (slug: string) =>
    apiFetch<{ posts: Post[] }>(`/events/${slug}/posts`),

  createPost: (slug: string, formData: FormData) =>
    apiFetch<{ post: Post }>(`/events/${slug}/posts`, { method: 'POST', body: formData }),

  deletePost: (slug: string, postId: string, editToken?: string) =>
    apiFetch<void>(`/events/${slug}/posts/${postId}`, {
      method: 'DELETE',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  approvePost: (slug: string, postId: string, editToken?: string) =>
    apiFetch<{ post: { id: string; status: string } }>(`/events/${slug}/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  approveAllPosts: (slug: string, editToken?: string) =>
    apiFetch<{ approved: number }>(`/events/${slug}/posts/approve-all`, {
      method: 'POST',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  toggleReaction: (slug: string, postId: string, emoji: string) =>
    apiFetch<{ reactions: Record<string, number>; myReactions: string[] }>(
      `/events/${slug}/posts/${postId}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji }) },
    ),

  // Album
  listAlbum: (slug: string) =>
    apiFetch<{ photos: (AlbumPhoto & { isOwn?: boolean })[] }>(`/events/${slug}/album`),

  uploadToAlbum: (slug: string, formData: FormData) =>
    apiFetch<{ photos: (AlbumPhoto & { isOwn?: boolean })[] }>(`/events/${slug}/album`, { method: 'POST', body: formData }),

  deletePhoto: (slug: string, photoId: string, editToken?: string) =>
    apiFetch<void>(`/events/${slug}/album/${photoId}`, {
      method: 'DELETE',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  // Messages
  listMessages: (slug: string) =>
    apiFetch<{ messages: Array<{ id: string; displayName: string; subject: string | null; body: string; type: string; createdAt: string }> }>(`/events/${slug}/messages`),

  postMessage: (slug: string, body: { displayName: string; body: string }) =>
    apiFetch<{ message: { id: string; displayName: string; subject: string | null; body: string; type: string; createdAt: string } }>(`/events/${slug}/messages`, { method: 'POST', body: JSON.stringify(body) }),

  deleteMessage: (slug: string, messageId: string, editToken?: string) =>
    apiFetch<void>(`/events/${slug}/messages/${messageId}`, {
      method: 'DELETE',
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  sendBlast: (slug: string, body: { subject: string; body: string; channels: string[] }, editToken?: string) =>
    apiFetch<{ queued: number }>(`/events/${slug}/blast`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: editToken ? { 'x-edit-token': editToken } : {},
    }),

  // Signals
  sendSignal: (slug: string, body: { toGuestId: string; type: 'wink' | 'crush' }) =>
    apiFetch<{ signal: { type: string; mutualReveal: boolean } }>(`/events/${slug}/signals`, { method: 'POST', body: JSON.stringify(body) }),

  listSentSignals: (slug: string) =>
    apiFetch<{ signals: Array<{ id: string; toGuestId: string; type: string; revealed: boolean; recipientName: string | null; recipientAvatarUrl: string | null; createdAt: string }> }>(`/events/${slug}/signals/sent`),

  // Direct messages
  sendDm: (slug: string, body: { toGuestId: string; body: string }) =>
    apiFetch<{ message: { id: string; body: string; createdAt: string } }>(`/events/${slug}/dm`, { method: 'POST', body: JSON.stringify(body) }),

  getDmThread: (slug: string, guestId: string) =>
    apiFetch<{ messages: Array<{ id: string; fromMe: boolean; body: string; readAt: string | null; createdAt: string }>; blocked: boolean; otherGuest: { id: string; name: string; avatarUrl: string | null; bio: string | null; vibe: string | null } | null }>(`/events/${slug}/dm/${guestId}`),

  blockGuest: (slug: string, guestId: string) =>
    apiFetch<void>(`/events/${slug}/dm/${guestId}/block`, { method: 'POST' }),

  unblockGuest: (slug: string, guestId: string) =>
    apiFetch<void>(`/events/${slug}/dm/${guestId}/block`, { method: 'DELETE' }),

  // Session
  getSession: () =>
    apiFetch<{ session: { displayName: string | null; email: string | null }; events: Array<{ slug: string; title: string; startsAt: string; myStatus: string | null; isEditor: boolean }> }>('/session/me'),

  updateSession: (body: { displayName?: string; email?: string }) =>
    apiFetch<{ session: { displayName: string | null; email: string | null } }>('/session/me', { method: 'PATCH', body: JSON.stringify(body) }),

  submitProfile: (body: { displayName: string; email: string; phone?: string; instagramHandle?: string }) =>
    apiFetch<{ ok: boolean }>('/session/profile', { method: 'POST', body: JSON.stringify(body) }),

  clearIdentity: () =>
    apiFetch<void>('/session/clear', { method: 'POST' }),

  // Admin
  listAdminEvents: () =>
    apiFetch<{ events: Array<{ slug: string; title: string; status: string; startsAt: string }> }>('/admin/events'),

  listUsers: () =>
    apiFetch<{ users: Array<{ id: string; email: string; displayName: string; role: string; createdAt: string }> }>('/admin/users'),

  createUser: (body: { email: string; password: string; displayName: string; role: string }) =>
    apiFetch<{ user: { id: string; email: string; displayName: string; role: string } }>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),

  // People directory
  createGuest: (body: { name: string; email?: string; phone?: string; instagramHandle?: string; notes?: string }) =>
    apiFetch<{ contact: { id: string; name: string; email: string | null } }>('/guests', { method: 'POST', body: JSON.stringify(body) }),

  updateGuest: (guestId: string, body: { name?: string; email?: string | null; phone?: string | null; instagramHandle?: string | null; notes?: string | null }) =>
    apiFetch<{ contact: { id: string; name: string; email: string | null; phone: string | null; instagramHandle: string | null; notes: string | null } }>(
      `/guests/${guestId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteGuest: (guestId: string) =>
    apiFetch<void>(`/guests/${guestId}`, { method: 'DELETE' }),

  // Deprecated aliases
  createContact: (body: { name: string; email?: string; phone?: string; instagramHandle?: string; notes?: string }) =>
    apiFetch<{ contact: { id: string; name: string; email: string | null } }>('/guests', { method: 'POST', body: JSON.stringify(body) }),

  updateContact: (guestId: string, body: { name?: string; email?: string | null; phone?: string | null; instagramHandle?: string | null; notes?: string | null }) =>
    apiFetch<{ contact: { id: string; name: string; email: string | null; phone: string | null; instagramHandle: string | null; notes: string | null } }>(
      `/guests/${guestId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteContact: (guestId: string) =>
    apiFetch<void>(`/guests/${guestId}`, { method: 'DELETE' }),

  // Admin guests
  adminBlockGuest: (sessionId: string, body: { reason: string; blockEmail?: boolean }) =>
    apiFetch<void>(`/admin/guests/session/${sessionId}/block`, { method: 'PATCH', body: JSON.stringify(body) }),

  adminUnblockGuest: (sessionId: string) =>
    apiFetch<void>(`/admin/guests/session/${sessionId}/unblock`, { method: 'PATCH', body: '{}' }),

  removeGuest: (sessionId: string, body: { blockEmail?: boolean }) =>
    apiFetch<void>(`/admin/guests/session/${sessionId}`, { method: 'DELETE', body: JSON.stringify(body) }),

  // Setup
  getSetupStatus: () =>
    apiFetch<{ setupRequired: boolean }>('/setup/status'),

  submitSetup: (body: { email: string; password: string; displayName: string }) =>
    apiFetch<{ user: { id: string } }>('/setup', { method: 'POST', body: JSON.stringify(body) }),
}
