import type { PageServerLoad, Actions } from './$types'
import { serverGet, serverPost, API_BASE } from '$lib/serverFetch'
import { buildCookieHeader } from '$lib/serverFetch'
import { fail } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ cookies, parent }) => {
  await parent()
  const res = await serverGet<{ users: Array<{ id: string; email: string; displayName: string; role: string; createdAt: string }> }>('/admin/users', cookies)
  return { users: res.users }
}

export const actions: Actions = {
  createUser: async ({ request, cookies }) => {
    const form = await request.formData()
    const email = form.get('email') as string
    const password = form.get('password') as string
    const displayName = form.get('displayName') as string
    const role = form.get('role') as string

    try {
      await serverPost('/admin/users', { email, password, displayName, role }, cookies)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create user.'
      return fail(400, { error: msg })
    }
  },

  deleteUser: async ({ request, cookies }) => {
    const form = await request.formData()
    const userId = form.get('userId') as string

    const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Cookie: buildCookieHeader(cookies) },
    })
    if (!res.ok) return fail(400, { error: 'Failed to delete user.' })
    return { success: true }
  },
}
