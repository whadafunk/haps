import type { LayoutServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'

export const load: LayoutServerLoad = async ({ cookies }) => {
  try {
    const { setupRequired } = await serverGet<{ setupRequired: boolean }>('/setup/status', cookies)
    if (setupRequired) return { meta: null, session: null, user: null, setupRequired: true }
  } catch {
    return { meta: null, session: null, user: null, setupRequired: false }
  }

  let user: { id: string; email: string; displayName: string; role: string } | null = null
  if (cookies.get('auth_token')) {
    try {
      user = await serverGet<{ id: string; email: string; displayName: string; role: string }>('/auth/me', cookies)
    } catch {
      // expired or invalid JWT — treat as anonymous
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

  return { meta: null, session, user, setupRequired: false }
}
