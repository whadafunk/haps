import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet, ServerApiError } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies }) => {
  if (!cookies.get('auth_token')) redirect(302, '/login')
  try {
    const [meRes, eventsRes] = await Promise.all([
      serverGet<{ id: string; email: string; displayName: string; role: string }>('/auth/me', cookies),
      serverGet<{ events: Array<{ slug: string; title: string; status: string; startsAt: string }> }>('/admin/events', cookies),
    ])
    return { user: meRes, events: eventsRes.events }
  } catch (e: unknown) {
    if (e instanceof ServerApiError && e.statusCode === 401) redirect(302, '/login')
    throw e
  }
}
