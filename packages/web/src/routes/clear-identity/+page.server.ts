import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { API_BASE, buildCookieHeader } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies }) => {
  await fetch(`${API_BASE}/api/session/clear`, {
    method: 'POST',
    headers: { Cookie: buildCookieHeader(cookies) },
  }).catch(() => {})

  cookies.delete('vsid', { path: '/' })

  redirect(302, '/')
}
