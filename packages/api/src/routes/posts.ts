import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, posts, albumPhotos, postPhotos, users, guests, rsvps, visitorSessions, postReactions } from '../db/schema.js'
import { eq, and, isNull, asc, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createError } from '../lib/errors.js'
import { broadcast } from '../lib/sse.js'
import { ensureSession } from '../middleware/session.js'
import { detectMimeType, getAllowedExtension, saveLocalFile } from '../services/storage.js'
import { nanoid } from 'nanoid'
import { config } from '../lib/config.js'
import { Readable } from 'stream'

const postsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:slug/posts', async (request) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id, showAlbum: events.showAlbum, wallRequiresRsvp: events.wallRequiresRsvp, moderatePosts: events.moderatePosts })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (!event.showAlbum) throw createError(403, 'WALL_DISABLED', 'Wall is disabled for this event.')

    if (event.wallRequiresRsvp) {
      const session = request.session
      const hasRsvp = session ? await (async () => {
        const where = session.guestId
          ? and(eq(rsvps.eventId, event.id), eq(rsvps.guestId, session.guestId))
          : and(eq(rsvps.eventId, event.id), eq(rsvps.sessionId, session.id))
        const rows = await db.select({ id: rsvps.id }).from(rsvps).where(where).limit(1)
        return rows.length > 0
      })() : false
      if (!hasRsvp) throw createError(403, 'RSVP_REQUIRED', 'You must RSVP to view the wall.')
    }

    // Editors see all non-deleted posts (pending + approved); guests see approved only
    const statusFilter = request.isEditor
      ? isNull(posts.deletedAt)
      : and(isNull(posts.deletedAt), eq(posts.status, 'approved'))

    const postRows = await db
      .select({
        id: posts.id,
        authorName: posts.authorName,
        body: posts.body,
        status: posts.status,
        sessionId: posts.sessionId,
        userId: posts.userId,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(and(eq(posts.eventId, event.id), statusFilter))
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
    const currentGuestId = request.session?.guestId
    const currentUserId = request.user?.sub

    const guestIdBySession: Record<string, string> = {}
    const guestIdByUser: Record<string, string> = {}

    const sessionIds = postRows.map((p) => p.sessionId).filter((id): id is string => !!id)
    if (sessionIds.length > 0) {
      const rows = await db
        .select({ id: visitorSessions.id, guestId: visitorSessions.guestId })
        .from(visitorSessions)
        .where(inArray(visitorSessions.id, sessionIds))
      for (const r of rows) {
        if (r.guestId) guestIdBySession[r.id] = r.guestId
      }
    }

    const userIds = postRows.map((p) => p.userId).filter((id): id is string => !!id)
    if (userIds.length > 0) {
      const rows = await db
        .select({ id: guests.id, userId: guests.userId })
        .from(guests)
        .where(inArray(guests.userId, userIds))
      for (const r of rows) {
        if (r.userId) guestIdByUser[r.userId] = r.id
      }
    }

    const reactionsMap: Record<string, Record<string, number>> = {}
    const myReactionsMap: Record<string, string[]> = {}

    if (postIds.length > 0) {
      const reactionRows = await db
        .select({
          postId: postReactions.postId,
          emoji: postReactions.emoji,
          count: sql<number>`count(*)::int`,
        })
        .from(postReactions)
        .where(inArray(postReactions.postId, postIds))
        .groupBy(postReactions.postId, postReactions.emoji)

      for (const r of reactionRows) {
        if (!reactionsMap[r.postId]) reactionsMap[r.postId] = {}
        reactionsMap[r.postId]![r.emoji] = r.count
      }

      if (currentGuestId || currentSessionId) {
        const myWhere = currentGuestId
          ? and(inArray(postReactions.postId, postIds), eq(postReactions.guestId, currentGuestId))
          : and(inArray(postReactions.postId, postIds), eq(postReactions.sessionId, currentSessionId!))
        const myRows = await db
          .select({ postId: postReactions.postId, emoji: postReactions.emoji })
          .from(postReactions)
          .where(myWhere)
        for (const r of myRows) {
          if (!myReactionsMap[r.postId]) myReactionsMap[r.postId] = []
          myReactionsMap[r.postId]!.push(r.emoji)
        }
      }
    }

    return {
      posts: postRows.map((p) => ({
        id: p.id,
        authorName: p.authorName,
        body: p.body,
        status: p.status as 'pending' | 'approved',
        photos: photosMap[p.id] ?? [],
        createdAt: p.createdAt.toISOString(),
        guestId: (p.sessionId && guestIdBySession[p.sessionId]) || (p.userId && guestIdByUser[p.userId]) || null,
        reactions: reactionsMap[p.id] ?? {},
        myReactions: myReactionsMap[p.id] ?? [],
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
      .select({ id: events.id, showAlbum: events.showAlbum, wallRequiresRsvp: events.wallRequiresRsvp, status: events.status, moderatePosts: events.moderatePosts })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (!event.showAlbum) throw createError(403, 'WALL_DISABLED', 'Wall is disabled for this event.')
    if (event.status !== 'published') throw createError(403, 'EVENT_NOT_PUBLISHED', 'Event is not published.')

    const session = request.session!
    if (event.wallRequiresRsvp) {
      const where = session.guestId
        ? and(eq(rsvps.eventId, event.id), eq(rsvps.guestId, session.guestId))
        : and(eq(rsvps.eventId, event.id), eq(rsvps.sessionId, session.id))
      const rsvpRows = await db.select({ id: rsvps.id }).from(rsvps).where(where).limit(1)
      if (rsvpRows.length === 0) throw createError(403, 'RSVP_REQUIRED', 'You must RSVP to post on the wall.')
    }

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

    // Editors posting on their own event are never held for moderation
    const postStatus = event.moderatePosts && !request.isEditor ? 'pending' : 'approved'

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
        status: postStatus,
      }).returning({ id: posts.id, authorName: posts.authorName, body: posts.body, status: posts.status, createdAt: posts.createdAt })

      if (!post) throw createError(500, 'INTERNAL_ERROR', 'Failed to create post.')

      if (insertedPhotos.length > 0) {
        await tx.insert(postPhotos).values(
          insertedPhotos.map((p, i) => ({ postId: post.id, photoId: p.id, sortOrder: i }))
        )
      }

      return { post, insertedPhotos }
    })

    const responsePost = {
      id: result.post.id,
      authorName: result.post.authorName,
      body: result.post.body,
      status: result.post.status as 'pending' | 'approved',
      photos: photoRecords.map((p, i) => ({ id: result.insertedPhotos[i]?.id ?? '', url: p.url, caption: null })),
      createdAt: result.post.createdAt.toISOString(),
      guestId: session.guestId ?? null,
      reactions: {} as Record<string, number>,
      myReactions: [] as string[],
    }

    // Only broadcast approved posts to connected guests
    if (postStatus === 'approved') {
      broadcast(slug, 'new_post', { ...responsePost, isOwn: false })
    }

    return reply.code(201).send({ post: { ...responsePost, isOwn: true } })
  })

  // Approve or reject a single pending post (editor only)
  fastify.patch('/api/events/:slug/posts/:postId', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { postId } = request.params as { slug: string; postId: string }
    const BodySchema = z.object({ status: z.enum(['approved']) }).strict()
    const { status } = BodySchema.parse(request.body)

    const rows = await db
      .select({ id: posts.id, eventId: posts.eventId, authorName: posts.authorName, body: posts.body, createdAt: posts.createdAt, guestId: posts.sessionId })
      .from(posts)
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
      .limit(1)

    const post = rows[0]
    if (!post) throw createError(404, 'POST_NOT_FOUND', 'Post not found.')

    await db.update(posts).set({ status }).where(eq(posts.id, postId))

    if (status === 'approved') {
      // Broadcast the now-approved post to connected guests
      const slug = (request.params as { slug: string }).slug
      const approvedPost = {
        id: post.id,
        authorName: post.authorName,
        body: post.body,
        status: 'approved' as const,
        photos: [] as Array<{ id: string; url: string; caption: null }>,
        createdAt: post.createdAt.toISOString(),
        guestId: null,
        reactions: {} as Record<string, number>,
        myReactions: [] as string[],
        isOwn: false,
      }
      // Fetch photos for the broadcast
      const photoRows = await db
        .select({ id: albumPhotos.id, url: albumPhotos.url, caption: albumPhotos.caption })
        .from(postPhotos)
        .innerJoin(albumPhotos, eq(postPhotos.photoId, albumPhotos.id))
        .where(and(eq(postPhotos.postId, postId), isNull(albumPhotos.deletedAt)))
        .orderBy(asc(postPhotos.sortOrder))
      approvedPost.photos = photoRows.map(p => ({ id: p.id, url: p.url, caption: null }))
      broadcast(slug, 'new_post', approvedPost)
    }

    return reply.send({ post: { id: postId, status } })
  })

  // Approve all pending posts for an event (editor only)
  fastify.post('/api/events/:slug/posts/approve-all', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const pending = await db
      .select({ id: posts.id, authorName: posts.authorName, body: posts.body, createdAt: posts.createdAt })
      .from(posts)
      .where(and(eq(posts.eventId, event.id), eq(posts.status, 'pending'), isNull(posts.deletedAt)))

    if (pending.length === 0) return reply.send({ approved: 0 })

    const pendingIds = pending.map(p => p.id)
    await db.update(posts).set({ status: 'approved' }).where(inArray(posts.id, pendingIds))

    // Broadcast each newly-approved post
    for (const post of pending) {
      const photoRows = await db
        .select({ id: albumPhotos.id, url: albumPhotos.url })
        .from(postPhotos)
        .innerJoin(albumPhotos, eq(postPhotos.photoId, albumPhotos.id))
        .where(and(eq(postPhotos.postId, post.id), isNull(albumPhotos.deletedAt)))
        .orderBy(asc(postPhotos.sortOrder))
      broadcast(slug, 'new_post', {
        id: post.id,
        authorName: post.authorName,
        body: post.body,
        status: 'approved',
        photos: photoRows.map(p => ({ id: p.id, url: p.url, caption: null })),
        createdAt: post.createdAt.toISOString(),
        guestId: null,
        reactions: {},
        myReactions: [],
        isOwn: false,
      })
    }

    return reply.send({ approved: pending.length })
  })

  fastify.post('/api/events/:slug/posts/:postId/reactions', async (request, reply) => {
    const { slug, postId } = request.params as { slug: string; postId: string }
    await ensureSession(request, reply)

    const ALLOWED_EMOJIS = ['❤️', '😂', '🎉', '🔥']
    const BodySchema = z.object({ emoji: z.enum(['❤️', '😂', '🎉', '🔥']) }).strict()
    const { emoji } = BodySchema.parse(request.body)

    const eventRows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const postRows = await db
      .select({ id: posts.id, eventId: posts.eventId, status: posts.status })
      .from(posts)
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
      .limit(1)
    const post = postRows[0]
    if (!post || post.eventId !== event.id) throw createError(404, 'POST_NOT_FOUND', 'Post not found.')
    // Guests cannot react to pending posts
    if (post.status === 'pending' && !request.isEditor) throw createError(403, 'POST_PENDING', 'This post is awaiting moderation.')

    const session = request.session!
    const guestId = session.guestId ?? null

    if (guestId) {
      const existing = await db
        .select({ id: postReactions.id })
        .from(postReactions)
        .where(and(eq(postReactions.postId, postId), eq(postReactions.guestId, guestId), eq(postReactions.emoji, emoji)))
        .limit(1)
      if (existing.length > 0) {
        await db.delete(postReactions).where(eq(postReactions.id, existing[0]!.id))
      } else {
        await db.insert(postReactions).values({ postId, guestId, emoji })
      }
    } else {
      const existing = await db
        .select({ id: postReactions.id })
        .from(postReactions)
        .where(and(eq(postReactions.postId, postId), eq(postReactions.sessionId, session.id), eq(postReactions.emoji, emoji)))
        .limit(1)
      if (existing.length > 0) {
        await db.delete(postReactions).where(eq(postReactions.id, existing[0]!.id))
      } else {
        await db.insert(postReactions).values({ postId, sessionId: session.id, emoji })
      }
    }

    const allReactions = await db
      .select({ emoji: postReactions.emoji, count: sql<number>`count(*)::int` })
      .from(postReactions)
      .where(eq(postReactions.postId, postId))
      .groupBy(postReactions.emoji)

    const reactions: Record<string, number> = {}
    for (const r of allReactions) reactions[r.emoji] = r.count

    const myWhere = guestId
      ? and(eq(postReactions.postId, postId), eq(postReactions.guestId, guestId))
      : and(eq(postReactions.postId, postId), eq(postReactions.sessionId, session.id))
    const myRows = await db.select({ emoji: postReactions.emoji }).from(postReactions).where(myWhere)
    const myReactions = myRows.map((r) => r.emoji)

    void ALLOWED_EMOJIS
    broadcast(slug, 'post_reaction', { postId, reactions })
    return reply.send({ reactions, myReactions })
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
