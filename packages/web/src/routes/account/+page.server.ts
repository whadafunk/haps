import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { serverGet, ServerApiError } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ parent, cookies }) => {
  const { user } = await parent()
  if (!user) redirect(302, '/login')

  let contact: { id: string; name: string; email: string; phone: string | null; instagramHandle: string | null } | null = null
  try {
    const res = await serverGet<{ contact: typeof contact }>('/auth/me/contact', cookies)
    contact = res.contact
  } catch (e: unknown) {
    if (!(e instanceof ServerApiError && e.statusCode === 404)) {
      // Unexpected error — swallow, contact stays null
    }
  }

  return { user, contact }
}
