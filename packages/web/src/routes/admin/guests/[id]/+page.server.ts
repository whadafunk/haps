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
  type: 'unclaimed' | 'claimed' | 'admin' | 'organizer' | 'session'
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
    // Old contact-prefixed IDs — use the unified guest endpoint
    endpoint = `/admin/guests/${id.slice(2)}`
  } else {
    // Bare UUID — direct guest lookup
    endpoint = `/admin/guests/${id}`
  }

  const data = await serverGet<{ guest: GuestDetail }>(endpoint, cookies).catch(() => null)
  if (!data) throw error(404)
  return { guest: data.guest }
}
