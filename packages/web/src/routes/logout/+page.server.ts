import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { API_BASE, buildCookieHeader } from '$lib/serverFetch'

function jwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString())
    return payload?.role ?? null
  } catch {
    return null
  }
}

export const load: PageServerLoad = async ({ cookies }) => {
  const token = cookies.get('auth_token')
  const role = token ? jwtRole(token) : null

  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: buildCookieHeader(cookies) },
  }).catch(() => {})

  cookies.delete('auth_token', { path: '/' })
  cookies.delete('refresh_token', { path: '/api/auth' })

  redirect(302, role === 'member' ? '/login' : '/admin')
}
