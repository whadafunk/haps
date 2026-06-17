import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { serverGet, ServerApiError } from '$lib/serverFetch'
import type { Event } from '@haps/shared'

export const load: PageServerLoad = async ({ params, url, cookies, parent }) => {
  const token = url.searchParams.get('t') ?? undefined
  const path = `/events/${params.slug}${token ? `?t=${encodeURIComponent(token)}` : ''}`

  const [layoutData, apiData] = await Promise.all([
    parent(),
    serverGet<{
      event: Event & { guestCount: number; yesCount: number; maybeCount: number; waitlistCount: number; organizerName: string | null }
      myRsvp: { status: string; headCount: number; note?: string | null; displayName: string } | null
      isEditor: boolean
      sessionProfileRequired: boolean
      sessionBlocked: boolean
      sessionBlockReason: string | null
      inviteAlreadyUsed: boolean
    }>(path, cookies).catch((e: unknown) => { throw e }),
  ]).catch((e: unknown) => {
    if (e instanceof ServerApiError && e.statusCode === 404) error(404, 'Event not found')
    if (e instanceof ServerApiError && e.statusCode === 403) error(403, 'This event requires an invite link.')
    throw e
  })

  const { event } = apiData
  const appUrl = process.env['APP_URL'] ?? 'http://localhost'

  // Derive locked identity: registered user > anonymous session with profile
  const { user, session } = layoutData
  const lockedIdentity = user
    ? { displayName: user.displayName, email: user.email }
    : (session?.displayName ? { displayName: session.displayName, email: session.email ?? null } : null)

  return {
    event:                  apiData.event,
    myRsvp:                 apiData.myRsvp,
    isEditor:               apiData.isEditor,
    sessionProfileRequired: apiData.sessionProfileRequired ?? false,
    sessionBlocked:         apiData.sessionBlocked ?? false,
    sessionBlockReason:     apiData.sessionBlockReason ?? null,
    inviteAlreadyUsed:      apiData.inviteAlreadyUsed ?? false,
    lockedIdentity,
    meta: {
      title:       event.title,
      description: `${new Date(event.startsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${event.location ? ` · ${event.location}` : ''}`,
      image:       event.coverImageUrl ?? `${appUrl}/og-default.png`,
      url:         `${appUrl}/event/${event.slug}`,
    },
  }
}
