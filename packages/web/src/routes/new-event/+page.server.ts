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
    const coordinates = data.get('coordinates')?.toString() || undefined
    const dressCode = data.get('dressCode')?.toString() || undefined
    const allowPlusOnes = data.get('allowPlusOnes') === 'on'
    const maxPlusOnesRaw = data.get('maxPlusOnes')?.toString()
    const maxPlusOnes = maxPlusOnesRaw ? parseInt(maxPlusOnesRaw, 10) : undefined
    const eventDate = data.get('eventDate')?.toString() ?? ''
    const eventTime = data.get('eventTime')?.toString() ?? ''
    const timezone = data.get('timezone')?.toString() ?? 'UTC'
    const theme = data.get('theme')?.toString() || undefined
    const eventTypeRaw = data.get('eventType')?.toString()
    const eventType = eventTypeRaw === 'invite_only' ? 'invite_only' : 'open'
    const maxCapacityRaw = data.get('maxCapacity')?.toString()
    const maxCapacity = maxCapacityRaw ? parseInt(maxCapacityRaw, 10) : undefined
    const rsvpDeadlineRaw = data.get('rsvpDeadline')?.toString()
    const rsvpDeadline = rsvpDeadlineRaw ? new Date(rsvpDeadlineRaw + 'T23:59:59Z').toISOString() : undefined

    if (!title || !eventDate || !eventTime) return fail(400, { error: 'Title, date, and time are required.' })

    try {
      const res = await serverPost<{ event: { slug: string }; editToken: string; editLink: string }>(
        '/events',
        {
          title, description, location, coordinates, dressCode, allowPlusOnes,
          ...(allowPlusOnes && maxPlusOnes ? { maxPlusOnes } : {}),
          startsAt: new Date(`${eventDate}T${eventTime}`).toISOString(),
          timezone, theme, eventType,
          ...(maxCapacity ? { maxCapacity } : {}),
          ...(rsvpDeadline ? { rsvpDeadline } : {}),
        },
        cookies,
      )
      redirect(302, `/event/${res.event.slug}/edit/${res.editToken}?created=1`)
    } catch (e: unknown) {
      if (e instanceof ServerApiError) return fail(e.statusCode, { error: e.message })
      throw e
    }
  },
}
