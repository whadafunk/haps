import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { serverGet, ServerApiError } from '$lib/serverFetch'
import type { Event, AlbumPhoto } from '@haps/shared'

export const load: PageServerLoad = async ({ params, cookies }) => {
  const [eventData, albumData] = await Promise.all([
    serverGet<{ event: Event; isEditor: boolean }>(
      `/events/${params.slug}`,
      cookies,
    ).catch((e: unknown) => {
      if (e instanceof ServerApiError && e.statusCode === 404) error(404, 'Event not found')
      if (e instanceof ServerApiError && e.statusCode === 403) error(403, 'This event requires an invite link.')
      throw e
    }),
    serverGet<{ photos: (AlbumPhoto & { isOwn?: boolean })[] }>(
      `/events/${params.slug}/album`,
      cookies,
    ).catch(() => ({ photos: [] as (AlbumPhoto & { isOwn?: boolean })[] })),
  ])

  return {
    event:    eventData.event,
    isEditor: eventData.isEditor,
    photos:   albumData.photos,
  }
}
