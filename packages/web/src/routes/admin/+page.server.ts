import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies, parent }) => {
  await parent()
  const [eventsRes, usersRes] = await Promise.all([
    serverGet<{ events: Array<{ slug: string; title: string; status: string; startsAt: string }> }>('/admin/events', cookies),
    serverGet<{ users: Array<{ id: string; email: string; role: string; createdAt: string }> }>('/admin/users', cookies),
  ])
  return { events: eventsRes.events, users: usersRes.users }
}
