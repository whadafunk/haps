import type { PageServerLoad, Actions } from './$types'
import { redirect, fail } from '@sveltejs/kit'

const API_BASE = process.env['INTERNAL_API_URL'] ?? process.env['API_URL'] ?? 'http://localhost:3000'

export const load: PageServerLoad = async ({ cookies }) => {
  if (cookies.get('auth_token')) redirect(302, '/dashboard')
  return {}
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
      const msg = body?.error?.message ?? 'Something went wrong.'
      return fail(res.status === 401 ? 401 : 500, { error: res.status === 401 ? 'Invalid email or password.' : msg })
    }

    const body = await res.json() as { user: { role: string } }

    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [nameVal, ...directives] = raw.split(';').map((s) => s.trim())
      const [name, ...valParts] = (nameVal ?? '').split('=')
      const value = valParts.join('=')
      if (!name || !value) continue

      const opts: Parameters<typeof cookies.set>[2] = { path: '/' }
      for (const d of directives) {
        const lower = d.toLowerCase()
        if (lower === 'httponly') opts.httpOnly = true
        else if (lower === 'secure') opts.secure = true
        else if (lower === 'samesite=strict') opts.sameSite = 'strict'
        else if (lower === 'samesite=lax') opts.sameSite = 'lax'
        else if (lower.startsWith('max-age=')) opts.maxAge = parseInt(lower.slice(8), 10)
        else if (lower.startsWith('path=')) opts.path = d.slice(5)
      }

      cookies.set(name, value, opts)
    }

    redirect(302, body.user.role === 'admin' ? '/admin' : '/dashboard')
  },
}
