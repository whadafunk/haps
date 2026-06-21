import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'
import { redirect } from '@sveltejs/kit'

export type InboxItem = {
  id: string
  type: string
  senderName: string | null
  subject: string | null
  body: string
  link: string | null
  read: boolean
  createdAt: string
  eventId: string | null
  eventTitle: string | null
  eventSlug: string | null
}

export const load: PageServerLoad = async ({ cookies }) => {
  if (!cookies.get('vsid')) redirect(302, '/')

  try {
    const data = await serverGet<{ notifications: InboxItem[]; unreadCount: number }>('/notifications', cookies)
    return { items: data.notifications, unreadCount: data.unreadCount }
  } catch {
    return { items: [] as InboxItem[], unreadCount: 0 }
  }
}
