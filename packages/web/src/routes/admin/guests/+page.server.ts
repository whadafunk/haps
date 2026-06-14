import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'

export interface GuestRow {
  id: string
  type: 'user' | 'session' | 'contact'
  displayName: string | null
  email: string | null
  firstSeen: string
  eventCount: number
}

export const load: PageServerLoad = async ({ parent, cookies }) => {
  await parent()
  const { guests } = await serverGet<{ guests: GuestRow[] }>('/admin/guests', cookies)
  return { guests }
}
