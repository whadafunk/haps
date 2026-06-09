import type { PageServerLoad, Actions } from './$types'
import { redirect, fail } from '@sveltejs/kit'

const API_BASE = process.env['INTERNAL_API_URL'] ?? process.env['API_URL'] ?? 'http://localhost:3000'

export const load: PageServerLoad = async () => {
  const res = await fetch(`${API_BASE}/api/setup/status`)
  if (res.ok) {
    const { setupRequired } = await res.json() as { setupRequired: boolean }
    if (!setupRequired) redirect(302, '/')
  }
  return {}
}

export const actions: Actions = {
  default: async ({ request }) => {
    const data = await request.formData()
    const email = data.get('email')?.toString() ?? ''
    const password = data.get('password')?.toString() ?? ''
    const displayName = data.get('displayName')?.toString() ?? ''

    if (!email || !password || !displayName) {
      return fail(400, { error: 'All fields are required.' })
    }

    const res = await fetch(`${API_BASE}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return fail(res.status, { error: body?.error?.message ?? 'Setup failed.' })
    }

    redirect(302, '/backend')
  },
}
