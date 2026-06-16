import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, posts, albumPhotos, postPhotos, users, guests } from '../db/schema.js'
import { eq, and, isNull, asc, inArray } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { ensureSession } from '../middleware/session.js'
import { detectMimeType, getAllowedExtension, saveLocalFile } from '../services/storage.js'
import { nanoid } from 'nanoid'
import { config } from '../lib/config.js'
import { Readable } from 'stream'

const postsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:slug/posts', async (request) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id, showAlbum: events.showAlbum })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (!event.showAlbum) throw createError(403, 'WALL_DISABLED', 'Wall is disabled for this event.')

    const postRows = await db
      .select({
        id: posts.id,
        authorName: posts.authorName,
        body: posts.body,
        sessionId: posts.sessionId,
        userId: posts.userId,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(and(eq(posts.eventId, event.id), isNull(posts.deletedAt)))
      .orderBy(asc(posts.createdAt))

    const postIds = postRows.map((r) => r.id)
    const photosMap: Record<string, Array<{ id: string; url: string; caption: string | null }>> = {}

    if (postIds.length > 0) {
      const photoRows = await db
        .select({
          postId: postPhotos.postId,
          id: albumPhotos.id,
          url: albumPhotos.url,
          caption: albumPhotos.caption,
          sortOrder: postPhotos.sortOrder,
        })
        .from(postPhotos)
        .innerJoin(albumPhotos, eq(postPhotos.photoId, albumPhotos.id))
        .where(and(inArray(postPhotos.postId, postIds), isNull(albumPhotos.deletedAt)))
        .orderBy(asc(postPhotos.sortOrder))

      for (const pr of photoRows) {
        if (!photosMap[pr.postId]) photosMap[pr.postId] = []
        photosMap[pr.postId]!.push({ id: pr.id, url: pr.url, caption: pr.caption })
      }
    }

    const currentSessionId = request.session?.id
    const currentUserId = request.user?.sub

    return {
      posts: postRows.map((p) => ({
        id: p.id,
        authorName: p.authorName,
        body: p.body,
        photos: photosMap[p.id] ?? [],
        createdAt: p.createdAt.toISOString(),
        isOwn: !!(
          (currentSessionId && p.sessionId === currentSessionId) ||
          (currentUserId && p.userId === currentUserId)
        ),
      })),
    }
  })

  fastify.post('/api/events/:slug/posts', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await ensureSession(request, reply)

    const eventRows = await db
      .select({ id: events.id, showAlbum: events.showAlbum, status: events.status })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (!event.showAlbum) throw createError(403, 'WALL_DISABLED', 'Wall is disabled for this event.')
    if (event.status !== 'published') throw createError(403, 'EVENT_NOT_PUBLISHED', 'Event is not published.')

    const session = request.session!
    if (!session.displayName && !request.user) {
      throw createError(428, 'PROFILE_REQUIRED', 'Complete your profile before posting.')
    }

    let authorName: string
    if (request.user?.type === 'guest') {
      const guestRows = await db
        .select({ name: guests.name })
        .from(guests)
        .where(eq(guests.id, request.user.sub))
        .limit(1)
      authorName = guestRows[0]?.name ?? session.displayName ?? 'Unknown'
    } else if (request.user?.type === 'operator') {
      const userRows = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1)
      authorName = userRows[0]?.displayName ?? 'Unknown'
    } else {
      authorName = session.displayName!
    }

    let body: string | undefined
    const photoBuffers: Buffer[] = []

    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'body') body = String(part.value).trim() || undefined
      } else {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of part.file) {
          size += chunk.length
          if (size > 10 * 1024 * 1024) throw createError(413, 'FILE_TOO_LARGE', 'File exceeds 10 MB limit.')
          chunks.push(chunk)
        }
        if (chunks.length > 0) photoBuffers.push(Buffer.concat(chunks))
      }
    }

    if (!body && photoBuffers.length === 0) {
      throw createError(400, 'EMPTY_POST', 'Post must have text or at least one photo.')
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

    const result = await db.transaction(async (tx) => {
      const insertedPhotos = photoRecords.length > 0
        ? await tx.insert(albumPhotos).values(
            photoRecords.map((p) => ({
              eventId: event.id,
              sessionId: session.id,
              userId: session.userId,
              uploaderName: authorName,
              url: p.url,
            }))
          ).returning({ id: albumPhotos.id })
        : []

      const [post] = await tx.insert(posts).values({
        eventId: event.id,
        sessionId: session.id,
        userId: session.userId,
        authorName,
        body: body ?? null,
      }).returning({ id: posts.id, authorName: posts.authorName, body: posts.body, createdAt: posts.createdAt })

      if (!post) throw createError(500, 'INTERNAL_ERROR', 'Failed to create post.')

      if (insertedPhotos.length > 0) {
        await tx.insert(postPhotos).values(
          insertedPhotos.map((p, i) => ({ postId: post.id, photoId: p.id, sortOrder: i }))
        )
      }

      return { post, insertedPhotos }
    })

    return reply.code(201).send({
      post: {
        id: result.post.id,
        authorName: result.post.authorName,
        body: result.post.body,
        photos: photoRecords.map((p, i) => ({ id: result.insertedPhotos[i]?.id ?? '', url: p.url, caption: null })),
        createdAt: result.post.createdAt.toISOString(),
        isOwn: true,
      },
    })
  })

  fastify.delete('/api/events/:slug/posts/:postId', async (request, reply) => {
    const { postId } = request.params as { slug: string; postId: string }

    const rows = await db
      .select({ id: posts.id, sessionId: posts.sessionId, userId: posts.userId })
      .from(posts)
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'POST_NOT_FOUND', 'Post not found.')

    const canDelete =
      request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub)

    if (!canDelete) throw createError(403, 'FORBIDDEN', 'Cannot delete this post.')

    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId))
    return reply.code(204).send()
  })
}

export default postsRoutes
