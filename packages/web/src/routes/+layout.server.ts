import type { LayoutServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'

export const load: LayoutServerLoad = async ({ cookies }) => {
  let requireRsvpBeforeRegister = true
  try {
    const status = await serverGet<{ setupRequired: boolean; requireRsvpBeforeRegister: boolean }>('/setup/status', cookies)
    if (status.setupRequired) return { meta: null, session: null, user: null, setupRequired: true, requireRsvpBeforeRegister: true }
    requireRsvpBeforeRegister = status.requireRsvpBeforeRegister
  } catch {
    return { meta: null, session: null, user: null, setupRequired: false, requireRsvpBeforeRegister: true }
  }

  let user: { id: string; email: string; displayName: string; role: string | null; type: 'guest' | 'operator' } | null = null
  if (cookies.get('auth_token')) {
    try {
      user = await serverGet<{ id: string; email: string; displayName: string; role: string | null; type: 'guest' | 'operator' }>('/auth/me', cookies)
    } catch {
      // auth_token expired — attempt a silent server-side refresh if refresh_token is present
      cookies.delete('auth_token', { path: '/' })
      if (cookies.get('refresh_token')) {
        try {
          await serverPost('/auth/refresh', null, cookies)
          // forwardCookies in serverPost has written the new auth_token into cookies
          user = await serverGet<{ id: string; email: string; displayName: string; role: string | null; type: 'guest' | 'operator' }>('/auth/me', cookies)
        } catch {
          // refresh also failed — clear everything
          cookies.delete('refresh_token', { path: '/' })
        }
      }
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
      const data = await serverGet<{ unreadCount: number }>('/notifications', cookies)
      unreadCount = data.unreadCount
    } catch {
      // non-critical
    }
  }

  return { meta: null, session, user, setupRequired: false, requireRsvpBeforeRegister, unreadCount }
}
