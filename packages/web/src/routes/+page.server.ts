import type { PageServerLoad, Actions } from './$types'
import { redirect, fail } from '@sveltejs/kit'
import { serverGet, API_BASE, buildCookieHeader } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ parent, cookies }) => {
  const { setupRequired, user } = await parent()
  if (setupRequired) redirect(302, '/setup')

  if (user) {
    if (user.role === 'admin' || user.role === 'organizer') redirect(302, '/admin')
    if (user.type === 'guest') redirect(302, '/my-events')
  }

  if (cookies.get('vsid')) {
    try {
      const data = await serverGet<{
        session: { displayName: string | null; email: string | null }
        events: Array<{ slug: string }>
      }>('/session/me', cookies)
      if (data.events.length > 0) redirect(302, '/my-events')
      return { session: data.session }
    } catch {
      // ignore — treat as no session
    }
  }

  return {}
}

export const actions: Actions = {
  updateIdentity: async ({ request, cookies }) => {
    const form = await request.formData()
    const displayName = (form.get('displayName') as string | null)?.trim()
    const email = (form.get('email') as string | null)?.trim()

    if (!displayName) return fail(400, { error: 'Name is required.' })

    const res = await fetch(`${API_BASE}/api/session/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: buildCookieHeader(cookies) },
      body: JSON.stringify({ displayName, email: email || undefined }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return fail(res.status, { error: body?.error?.message ?? 'Failed to update.' })
    }

    return { updated: true }
  },
}
