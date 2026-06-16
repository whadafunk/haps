import type { LayoutServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet } from '$lib/serverFetch'

export const load: LayoutServerLoad = async ({ cookies }) => {
  if (!cookies.get('auth_token')) return { user: null }

  let user: { id: string; email: string; displayName: string; role: string | null; type: string } | null = null
  try {
    user = await serverGet<{ id: string; email: string; displayName: string; role: string | null; type: string }>('/auth/me', cookies)
  } catch {
    // Expired or invalid JWT — show the inline staff login form
    return { user: null }
  }

  // redirect() throws a Redirect error; must be outside the try/catch or it gets swallowed
  if (!user || user.type === 'guest') redirect(302, '/my-events')
  if (user.role !== 'admin' && user.role !== 'organizer') redirect(302, '/')

  return { user }
}
