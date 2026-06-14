import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'
import { error } from '@sveltejs/kit'

export interface EventEntry {
  eventSlug: string
  eventTitle: string
  startsAt: string
  timezone: string
  rsvpStatus: string
  headCount: number
  checkedIn: boolean
  rsvpCreatedAt: string
}

export interface InviteEntry {
  tokenId: string
  eventSlug: string
  eventTitle: string
  startsAt: string
  timezone: string
  tokenStatus: string
  visited: boolean
  rsvpStatus: string | null
  headCount: number | null
}

export interface GuestDetail {
  id: string
  shortId: string
  type: 'user' | 'session' | 'contact'
  displayName: string | null
  email: string | null
  phone: string | null
  instagramHandle: string | null
  notes: string | null
  status: string
  statusReason: string | null
  firstSeen: string
  events: EventEntry[]
  invites: InviteEntry[]
}

export const load: PageServerLoad = async ({ params, parent, cookies }) => {
  await parent()
  const { id } = params
  let endpoint: string
  if (id.startsWith('u-')) {
    endpoint = `/admin/guests/user/${id.slice(2)}`
  } else if (id.startsWith('s-')) {
    endpoint = `/admin/guests/session/${id.slice(2)}`
  } else if (id.startsWith('c-')) {
    endpoint = `/admin/guests/contact/${id.slice(2)}`
  } else {
    throw error(404)
  }

  const { guest } = await serverGet<{ guest: GuestDetail }>(endpoint, cookies)
  return { guest }
}
