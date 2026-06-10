import type { LayoutServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet } from '$lib/serverFetch'

export const load: LayoutServerLoad = async ({ cookies }) => {
  if (!cookies.get('auth_token')) return { user: null }
  try {
    const user = await serverGet<{ id: string; email: string; displayName: string; role: string }>('/auth/me', cookies)
    if (user.role !== 'admin' && user.role !== 'organizer') redirect(302, '/')
    return { user }
  } catch {
    return { user: null }
  }
}
