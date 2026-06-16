import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import { ServerApiError, API_BASE, buildCookieHeader, forwardCookies } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ params, cookies, url }) => {
  const cookieHeader = buildCookieHeader(cookies)

  // Validate the token and store it in the session by hitting the API with the
  // raw token. The API writes the edit access into the vsid session cookie;
  // forwardCookies persists it to the browser. Then redirect to the canonical
  // edit URL so only one edit page component exists.
  const res = await fetch(`${API_BASE}/api/events/${params.slug}`, {
    headers: {
      'x-edit-token': params.token,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const err = new ServerApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText)
    if (err.statusCode === 403) error(403, 'Invalid edit token.')
    if (err.statusCode === 404) error(404, 'Event not found.')
    throw err
  }

  forwardCookies(res, cookies)

  const created = url.searchParams.get('created')
  redirect(302, `/event/${params.slug}/edit${created ? '?created=1' : ''}`)
}
