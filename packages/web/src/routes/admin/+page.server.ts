import type { PageServerLoad, Actions } from './$types'
import { redirect, fail } from '@sveltejs/kit'
import { serverGet, API_BASE, forwardCookies } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies, parent }) => {
  const { user } = await parent()
  if (!user) return { events: [], users: [] }

  const [eventsRes, usersRes] = await Promise.all([
    serverGet<{ events: Array<{ slug: string; title: string; status: string; startsAt: string; eventType: string }> }>('/admin/events', cookies),
    user.role === 'admin'
      ? serverGet<{ users: Array<{ id: string; email: string; role: string; createdAt: string }> }>('/admin/users', cookies)
      : Promise.resolve({ users: [] as Array<{ id: string; email: string; role: string; createdAt: string }> }),
  ])
  return { events: eventsRes.events, users: usersRes.users }
}

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData()
    const email = data.get('email')?.toString() ?? ''
    const password = data.get('password')?.toString() ?? ''

    if (!email || !password) return fail(400, { error: 'Email and password are required.' })

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return fail(res.status === 401 ? 401 : 500, {
        error: res.status === 401 ? 'Invalid email or password.' : (body?.error?.message ?? 'Something went wrong.'),
      })
    }

    const body = (await res.json()) as { user: { role: string } }
    if (body.user.role !== 'admin' && body.user.role !== 'organizer') {
      return fail(403, { error: 'This login is for staff only.' })
    }

    forwardCookies(res, cookies)
    redirect(302, '/admin')
  },
}
