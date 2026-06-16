import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ parent, cookies }) => {
  const { user, requireRsvpBeforeRegister } = await parent()
  if (user) redirect(302, user.type === 'guest' ? '/my-events' : '/dashboard')

  let sessionData: { displayName: string | null; email: string | null } | null = null
  let hasEvents = false

  if (cookies.get('vsid')) {
    try {
      const data = await serverGet<{
        session: { displayName: string | null; email: string | null }
        events: Array<unknown>
      }>('/session/me', cookies)
      sessionData = data.session
      hasEvents = data.events.length > 0
    } catch { /* ignore */ }
  }

  const noHistory = requireRsvpBeforeRegister && !hasEvents

  return { session: sessionData, noHistory }
}
