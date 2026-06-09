import type { LayoutServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet, ServerApiError } from '$lib/serverFetch'

export const load: LayoutServerLoad = async ({ cookies }) => {
  if (!cookies.get('auth_token')) redirect(302, '/backend')

  try {
    const user = await serverGet<{ id: string; email: string; displayName: string; role: string }>('/auth/me', cookies)
    if (user.role !== 'admin') redirect(302, '/dashboard')
    return { user }
  } catch (e: unknown) {
    if (e instanceof ServerApiError && e.statusCode === 401) redirect(302, '/backend')
    throw e
  }
}
