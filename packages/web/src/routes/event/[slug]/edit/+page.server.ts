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
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
      }).then(async (r) => {
        if (!r.ok) return { rsvps: [] as Rsvp[] }
        return r.json() as Promise<{ rsvps: Rsvp[] }>
      }),
    ])

    if (!eventRes.isEditor) error(403, 'You do not have edit access to this event.')

    return { event: eventRes.event, rsvps: rsvpsRes.rsvps, editToken: undefined as string | undefined }
  } catch (e: unknown) {
    if (e instanceof ServerApiError && e.statusCode === 404) error(404, 'Event not found.')
    if (e && typeof e === 'object' && 'status' in e) throw e
    throw e
  }
}
