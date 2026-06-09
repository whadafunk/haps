import type { LayoutServerLoad } from './$types'
import { serverGet, ServerApiError } from '$lib/serverFetch'

export const load: LayoutServerLoad = async ({ cookies }) => {
  try {
    const { setupRequired } = await serverGet<{ setupRequired: boolean }>('/setup/status', cookies)
    if (setupRequired) return { meta: null, session: null, setupRequired: true }
  } catch {
    return { meta: null, session: null, setupRequired: false }
  }

  let session = null
  if (cookies.get('vsid')) {
    try {
      const data = await serverGet<{ session: { displayName: string | null; email: string | null } }>('/session/me', cookies)
      session = data.session
    } catch {
      // Invalid session
    }
  }

  return { meta: null, session, setupRequired: false }
}
