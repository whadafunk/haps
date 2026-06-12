import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies, parent }) => {
  const { user } = await parent()
  if (!user) redirect(302, '/admin')
  const res = await serverGet<{ events: Array<{ slug: string; title: string; status: string; startsAt: string; eventType: string }> }>('/admin/events', cookies)
  return { events: res.events }
}
