import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { ServerApiError, API_BASE, buildCookieHeader, forwardCookies } from '$lib/serverFetch'
import type { Event, Rsvp } from '@haps/shared'

export const load: PageServerLoad = async ({ params, cookies }) => {
  const cookieHeader = buildCookieHeader(cookies)

  try {
    const [eventRaw, rsvpsRes, tokensRes] = await Promise.all([
      fetch(`${API_BASE}/api/events/${params.slug}`, {
        headers: {
          'x-edit-token': params.token,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      }),
      fetch(`${API_BASE}/api/events/${params.slug}/rsvps`, {
        headers: {
          'x-edit-token': params.token,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      }).then((r) => r.json() as Promise<{ rsvps: Rsvp[] }>),
      fetch(`${API_BASE}/api/events/${params.slug}/tokens`, {
        headers: {
          'x-edit-token': params.token,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      }).then((r) => r.json() as Promise<{ tokens: Array<{ id: string; type: string; label: string | null; status: string; singleUse: boolean; inviteUrl: string | null; claimedBySessionId: string | null; createdAt: string }> }>),
    ])

    if (!eventRaw.ok) {
      const body = await eventRaw.json().catch(() => null)
      throw new ServerApiError(eventRaw.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? eventRaw.statusText)
    }
    forwardCookies(eventRaw, cookies)
    const eventRes = await eventRaw.json() as {
      event: Event & { guestCount: number; yesCount: number; maybeCount: number }
      isEditor: boolean
      myRsvp: unknown
    }

    return { event: eventRes.event, rsvps: rsvpsRes.rsvps, tokens: tokensRes.tokens ?? [], editToken: params.token }
  } catch (e: unknown) {
    if (e instanceof ServerApiError && e.statusCode === 403) error(403, 'Invalid edit token.')
    if (e instanceof ServerApiError && e.statusCode === 404) error(404, 'Event not found.')
    throw e
  }
}
