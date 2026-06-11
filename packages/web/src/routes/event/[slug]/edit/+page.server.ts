import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { serverGet, ServerApiError, API_BASE, buildCookieHeader } from '$lib/serverFetch'
import type { Event, Rsvp } from '@haps/shared'

export const load: PageServerLoad = async ({ params, cookies }) => {
  const cookieHeader = buildCookieHeader(cookies)

  try {
    const [eventRes, rsvpsRes, tokensRes] = await Promise.all([
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
      fetch(`${API_BASE}/api/events/${params.slug}/tokens`, {
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
      }).then(async (r) => {
        if (!r.ok) return { tokens: [] }
        return r.json() as Promise<{ tokens: Array<{ id: string; type: string; label: string | null; status: string; singleUse: boolean; claimedBySessionId: string | null; createdAt: string }> }>
      }),
    ])

    if (!eventRes.isEditor) error(403, 'You do not have edit access to this event.')

    return {
      event: eventRes.event,
      rsvps: rsvpsRes.rsvps,
      tokens: tokensRes.tokens ?? [],
      editToken: undefined as string | undefined,
      initialInviteToken: null as string | null,
    }
  } catch (e: unknown) {
    if (e instanceof ServerApiError && e.statusCode === 404) error(404, 'Event not found.')
    if (e && typeof e === 'object' && 'status' in e) throw e
    throw e
  }
}
