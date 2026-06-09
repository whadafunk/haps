import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { API_BASE, buildCookieHeader } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies }) => {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: buildCookieHeader(cookies) },
  }).catch(() => {})

  cookies.delete('auth_token', { path: '/' })
  cookies.delete('refresh_token', { path: '/api/auth' })

  redirect(302, '/backend')
}
