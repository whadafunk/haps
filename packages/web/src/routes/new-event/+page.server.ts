import type { PageServerLoad, Actions } from './$types'
import { redirect, fail } from '@sveltejs/kit'
import { serverPost, ServerApiError } from '$lib/serverFetch'

export const load: PageServerLoad = async ({ cookies }) => {
  if (!cookies.get('auth_token')) redirect(302, '/backend')
  return {}
}

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData()
    const title = data.get('title')?.toString() ?? ''
    const description = data.get('description')?.toString() || undefined
    const location = data.get('location')?.toString() || undefined
    const eventDate = data.get('eventDate')?.toString() ?? ''
    const eventTime = data.get('eventTime')?.toString() ?? ''
    const timezone = data.get('timezone')?.toString() ?? 'UTC'
    const theme = data.get('theme')?.toString() || undefined

    if (!title || !eventDate || !eventTime) return fail(400, { error: 'Title, date, and time are required.' })

    try {
      const res = await serverPost<{ event: { slug: string }; editToken: string; editLink: string; inviteToken: string }>(
        '/events',
        {
          title, description, location,
          startsAt: new Date(`${eventDate}T${eventTime}`).toISOString(),
          timezone,
          theme,
        },
        cookies,
      )
      redirect(302, `/event/${res.event.slug}/edit/${res.editToken}?created=1&it=${encodeURIComponent(res.inviteToken)}`)
    } catch (e: unknown) {
      if (e instanceof ServerApiError) return fail(e.statusCode, { error: e.message })
      throw e
    }
  },
}
