import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, albumPhotos, users, guests } from '../db/schema.js'
import { eq, and, isNull, asc } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { ensureSession } from '../middleware/session.js'
import { detectMimeType, getAllowedExtension, saveLocalFile } from '../services/storage.js'
import { nanoid } from 'nanoid'
import { config } from '../lib/config.js'
import { Readable } from 'stream'

const albumRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:slug/album', async (request) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id, showAlbum: events.showAlbum })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (!event.showAlbum) throw createError(403, 'ALBUM_DISABLED', 'Album is disabled for this event.')

    const photos = await db
      .select({
        id: albumPhotos.id,
        uploaderName: albumPhotos.uploaderName,
        url: albumPhotos.url,
        caption: albumPhotos.caption,
        sessionId: albumPhotos.sessionId,
        userId: albumPhotos.userId,
        createdAt: albumPhotos.createdAt,
      })
      .from(albumPhotos)
      .where(and(eq(albumPhotos.eventId, event.id), isNull(albumPhotos.deletedAt)))
      .orderBy(asc(albumPhotos.createdAt))

    const currentSessionId = request.session?.id
    const currentUserId = request.user?.sub

    return {
      photos: photos.map((p) => ({
        id: p.id,
        uploaderName: p.uploaderName,
        url: p.url,
        caption: p.caption,
        createdAt: p.createdAt.toISOString(),
        isOwn: !!(
          (currentSessionId && p.sessionId === currentSessionId) ||
          (currentUserId && p.userId === currentUserId)
        ),
      })),
    }
  })

  fastify.post('/api/events/:slug/album', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await ensureSession(request, reply)

    const eventRows = await db
      .select({ id: events.id, showAlbum: events.showAlbum, status: events.status })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (!event.showAlbum) throw createError(403, 'ALBUM_DISABLED', 'Album is disabled for this event.')
    if (event.status !== 'published') throw createError(403, 'EVENT_NOT_PUBLISHED', 'Event is not published.')

    const session = request.session!
    if (!session.displayName && !request.user) {
      throw createError(428, 'PROFILE_REQUIRED', 'Complete your profile before uploading.')
    }

    let uploaderName: string
    if (request.user?.type === 'guest') {
      const guestRows = await db
        .select({ name: guests.name })
        .from(guests)
        .where(eq(guests.id, request.user.sub))
        .limit(1)
      uploaderName = guestRows[0]?.name ?? session.displayName ?? 'Unknown'
    } else if (request.user?.type === 'operator') {
      const userRows = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1)
      uploaderName = userRows[0]?.displayName ?? 'Unknown'
    } else {
      uploaderName = session.displayName!
    }

    const photoBuffers: Buffer[] = []

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of part.file) {
          size += chunk.length
          if (size > 10 * 1024 * 1024) throw createError(413, 'FILE_TOO_LARGE', 'File exceeds 10 MB limit.')
          chunks.push(chunk)
        }
        if (chunks.length > 0) photoBuffers.push(Buffer.concat(chunks))
      } else {
        // drain field parts
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        part.value
      }
    }

    if (photoBuffers.length === 0) {
      throw createError(400, 'NO_FILES', 'At least one photo is required.')
    }

    type PhotoRecord = { buffer: Buffer; filename: string; url: string }
    const photoRecords: PhotoRecord[] = []
    for (const buffer of photoBuffers) {
      const mimeType = detectMimeType(buffer)
      if (!mimeType) throw createError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, and GIF images are allowed.')
      const ext = getAllowedExtension(mimeType)!
      const filename = `${nanoid()}.${ext}`
      photoRecords.push({ buffer, filename, url: `${config.APP_URL}/api/uploads/${filename}` })
    }

    for (const { buffer, filename } of photoRecords) {
      await saveLocalFile(Readable.from(buffer), filename)
    }

    const inserted = await db.insert(albumPhotos).values(
      photoRecords.map((p) => ({
        eventId: event.id,
        sessionId: session.id,
        userId: session.userId,
        uploaderName,
        url: p.url,
      }))
    ).returning({ id: albumPhotos.id, url: albumPhotos.url, createdAt: albumPhotos.createdAt })

    return reply.code(201).send({
      photos: inserted.map((p) => ({
        id: p.id,
        uploaderName,
        url: p.url,
        caption: null,
        createdAt: p.createdAt.toISOString(),
        isOwn: true,
      })),
    })
  })

  fastify.delete('/api/events/:slug/album/:photoId', async (request, reply) => {
    const { photoId } = request.params as { slug: string; photoId: string }

    const rows = await db
      .select({ id: albumPhotos.id, sessionId: albumPhotos.sessionId, userId: albumPhotos.userId })
      .from(albumPhotos)
      .where(and(eq(albumPhotos.id, photoId), isNull(albumPhotos.deletedAt)))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'PHOTO_NOT_FOUND', 'Photo not found.')

    const canDelete =
      request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub)

    if (!canDelete) throw createError(403, 'FORBIDDEN', 'Cannot delete this photo.')

    await db.update(albumPhotos).set({ deletedAt: new Date() }).where(eq(albumPhotos.id, photoId))
    return reply.code(204).send()
  })
}

export default albumRoutes
