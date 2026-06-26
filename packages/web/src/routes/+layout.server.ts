import type { LayoutServerLoad } from './$types'
import { serverGet, serverPost } from '$lib/serverFetch'

export const load: LayoutServerLoad = async ({ cookies }) => {
  let requireRsvpBeforeRegister = true
  let smtpConfigured = false
  try {
    const status = await serverGet<{ setupRequired: boolean; requireRsvpBeforeRegister: boolean; smtpConfigured: boolean }>('/setup/status', cookies)
    if (status.setupRequired) return { meta: null, session: null, user: null, setupRequired: true, requireRsvpBeforeRegister: true, smtpConfigured: false }
    requireRsvpBeforeRegister = status.requireRsvpBeforeRegister
    smtpConfigured = status.smtpConfigured ?? false
  } catch {
    return { meta: null, session: null, user: null, setupRequired: false, requireRsvpBeforeRegister: true, smtpConfigured: false }
  }

  type AuthUser = { id: string; email: string; displayName: string; role: string | null; type: 'guest' | 'operator' }
  let user: AuthUser | null = null

  if (cookies.get('auth_token')) {
    try {
      user = await serverGet<AuthUser>('/auth/me', cookies)
    } catch {
      // auth_token present but invalid/expired — clear it and fall through to refresh
      cookies.delete('auth_token', { path: '/' })
    }
  }

  // If still no user but refresh_token exists, try a silent refresh.
  // This covers two cases: (a) auth_token was just cleared above, and
  // (b) auth_token maxAge elapsed so the browser never sent it at all.
  if (!user && cookies.get('refresh_token')) {
    try {
      await serverPost('/auth/refresh', null, cookies)
      user = await serverGet<AuthUser>('/auth/me', cookies)
    } catch {
      cookies.delete('refresh_token', { path: '/' })
    }
  }

  let session: { displayName: string | null; email: string | null; guestId: string | null } | null = null
  if (!user && cookies.get('vsid')) {
    try {
      const data = await serverGet<{ session: { displayName: string | null; email: string | null; guestId: string | null } }>('/session/me', cookies)
      session = data.session
    } catch {
      // invalid session cookie
    }
  }

  let unreadCount = 0
  if ((user?.type === 'guest' || (!user && session)) && cookies.get('vsid')) {
    try {
      const data = await serverGet<{ unreadCount: number; unreadDmCount: number }>('/notifications', cookies)
      unreadCount = data.unreadCount + (data.unreadDmCount ?? 0)
    } catch {
      // non-critical
    }
  }

  return { meta: null, session, user, setupRequired: false, requireRsvpBeforeRegister, smtpConfigured, unreadCount }
}
