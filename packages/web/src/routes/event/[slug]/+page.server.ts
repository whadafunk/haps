import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { serverGet, ServerApiError } from '$lib/serverFetch'
import type { Event } from '@haps/shared'

export const load: PageServerLoad = async ({ params, url, cookies }) => {
  const token = url.searchParams.get('t') ?? undefined
  const path = `/events/${params.slug}${token ? `?t=${encodeURIComponent(token)}` : ''}`

  try {
    const data = await serverGet<{
      event: Event & { guestCount: number; yesCount: number; maybeCount: number }
      myRsvp: { status: string; headCount: number; note?: string | null } | null
      isEditor: boolean
      sessionProfileRequired: boolean
      sessionBlocked: boolean
      sessionBlockReason: string | null
    }>(path, cookies)

    const { event } = data
    const appUrl = process.env['APP_URL'] ?? 'http://localhost'

    return {
      event:                  data.event,
      myRsvp:                 data.myRsvp,
      isEditor:               data.isEditor,
      sessionProfileRequired: data.sessionProfileRequired ?? false,
      sessionBlocked:         data.sessionBlocked ?? false,
      sessionBlockReason:     data.sessionBlockReason ?? null,
      meta: {
        title:       event.title,
        description: `${new Date(event.startsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${event.location ? ` · ${event.location}` : ''}`,
        image:       event.coverImageUrl ?? `${appUrl}/og-default.png`,
        url:         `${appUrl}/event/${event.slug}`,
      },
    }
  } catch (e: unknown) {
    if (e instanceof ServerApiError && e.statusCode === 404) error(404, 'Event not found')
    if (e instanceof ServerApiError && e.statusCode === 403) error(403, 'This event requires an invite link.')
    throw e
  }
}
