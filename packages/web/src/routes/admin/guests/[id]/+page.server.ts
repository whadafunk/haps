import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'
import { error } from '@sveltejs/kit'

export interface GuestDetail {
  id: string
  type: 'user' | 'session'
  displayName: string | null
  email: string | null
  firstSeen: string
  events: {
    eventSlug: string
    eventTitle: string
    startsAt: string
    timezone: string
    rsvpStatus: string
    headCount: number
    checkedIn: boolean
    rsvpCreatedAt: string
  }[]
}

export const load: PageServerLoad = async ({ params, parent, cookies }) => {
  await parent()
  const { id } = params
  let endpoint: string
  if (id.startsWith('u-')) {
    endpoint = `/admin/guests/user/${id.slice(2)}`
  } else if (id.startsWith('s-')) {
    endpoint = `/admin/guests/session/${id.slice(2)}`
  } else {
    throw error(404)
  }

  const { guest } = await serverGet<{ guest: GuestDetail }>(endpoint, cookies)
  return { guest }
}
