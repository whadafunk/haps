import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies, parent }) => {
  await parent()
  const res = await serverGet<{ events: Array<{ slug: string; title: string; status: string; startsAt: string }> }>('/admin/events', cookies)
  return { events: res.events }
}
