import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ parent }) => {
  const { user, session } = await parent()
  if (user) redirect(302, user.type === 'guest' ? '/my-events' : '/dashboard')
  return { session }
}
