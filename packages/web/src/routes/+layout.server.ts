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
  let hadExpiredToken = false
  if (cookies.get('auth_token')) {
    try {
      user = await serverGet<{ id: string; email: string; displayName: string; role: string | null; type: 'guest' | 'operator' }>('/auth/me', cookies)
    } catch {
      // expired or invalid JWT — clear the stale cookie so the nav doesn't
      // show the session display name as if the user is still a logged-in guest
      hadExpiredToken = true
      cookies.delete('auth_token', { path: '/' })
    }
  }

  let session: { displayName: string | null; email: string | null } | null = null
  if (!user && cookies.get('vsid')) {
    try {
      const data = await serverGet<{ session: { displayName: string | null; email: string | null } }>('/session/me', cookies)
      session = data.session
    } catch {
      // invalid session cookie
    }
  }

  return { meta: null, session, user, setupRequired: false, requireRsvpBeforeRegister }
}
