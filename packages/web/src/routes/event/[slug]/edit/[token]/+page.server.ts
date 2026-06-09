import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { serverGet, ServerApiError, API_BASE, buildCookieHeader } from '$lib/serverFetch'
import type { Event, Rsvp } from '@haps/shared'

export const load: PageServerLoad = async ({ params, cookies }) => {
  const cookieHeader = buildCookieHeader(cookies)

  try {
    const [eventRes, rsvpsRes] = await Promise.all([
      serverGet<{
        event: Event & { guestCount: number; yesCount: number; maybeCount: number }
        isEditor: boolean
        myRsvp: unknown
      }>(`/events/${params.slug}`, cookies),
      fetch(`${API_BASE}/api/events/${params.slug}/rsvps`, {
        headers: {
          'x-edit-token': params.token,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      }).then((r) => r.json() as Promise<{ rsvps: Rsvp[] }>),
    ])

    return { event: eventRes.event, rsvps: rsvpsRes.rsvps, editToken: params.token }
  } catch (e: unknown) {
    if (e instanceof ServerApiError && e.statusCode === 403) error(403, 'Invalid edit token.')
    if (e instanceof ServerApiError && e.statusCode === 404) error(404, 'Event not found.')
    throw e
  }
}
