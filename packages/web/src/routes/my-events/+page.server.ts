import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies }) => {
  try {
    const data = await serverGet<{
      session: { displayName: string | null; email: string | null }
      events: Array<{ slug: string; title: string; startsAt: string; myStatus: string | null; isEditor: boolean }>
    }>('/session/me', cookies)
    return { session: data.session, events: data.events }
  } catch {
    return { session: null, events: [] }
  }
}
