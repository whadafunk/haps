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

export type DmThread = {
  otherGuestId: string
  otherGuestName: string
  otherGuestAvatar: string | null
  eventId: string
  eventSlug: string
  eventTitle: string
  lastMessage: string
  lastMessageAt: string
  fromMe: boolean
  unreadCount: number
}

export const load: PageServerLoad = async ({ cookies }) => {
  if (!cookies.get('vsid')) redirect(302, '/')

  const [notifData, dmData] = await Promise.all([
    serverGet<{ notifications: InboxItem[]; unreadCount: number }>('/notifications', cookies)
      .catch(() => ({ notifications: [] as InboxItem[], unreadCount: 0 })),
    serverGet<{ threads: DmThread[] }>('/dm/threads', cookies)
      .catch(() => ({ threads: [] as DmThread[] })),
  ])

  const dmUnreadCount = dmData.threads.reduce((sum, t) => sum + t.unreadCount, 0)

  return {
    items: notifData.notifications,
    threads: dmData.threads,
    dmUnreadCount,
  }
}
