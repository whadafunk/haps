import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ parent }) => {
  const { setupRequired } = await parent()
  if (setupRequired) redirect(302, '/setup')
  return {}
}
