import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ parent, cookies }) => {
  const { setupRequired, user } = await parent()
  if (setupRequired) redirect(302, '/setup')

  if (user) {
    if (user.role === 'admin' || user.role === 'organizer') redirect(302, '/admin')
    if (user.role === 'member') redirect(302, '/my-events')
  }

  if (cookies.get('vsid')) {
    try {
      const { events } = await serverGet<{
        session: unknown
        events: Array<{ slug: string }>
      }>('/session/me', cookies)
      if (events.length > 0) redirect(302, '/my-events')
    } catch {
      // ignore — treat as no events
    }
  }

  return {}
}
