import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, comments } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateCommentSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'

const commentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:slug/comments', async (request) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const rows = await db
      .select({
        id: comments.id,
        displayName: comments.displayName,
        body: comments.body,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.eventId, event.id), isNull(comments.deletedAt)))
      .orderBy(comments.createdAt)

    return { comments: rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })) }
  })

  fastify.post('/api/events/:slug/comments', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await ensureSession(request, reply)

    const body = CreateCommentSchema.parse(request.body)

    const eventRows = await db
      .select({ id: events.id, allowComments: events.allowComments, status: events.status })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (!event.allowComments) throw createError(403, 'COMMENTS_DISABLED', 'Comments are disabled for this event.')
    if (event.status !== 'published') throw createError(403, 'EVENT_NOT_PUBLISHED', 'Event is not published.')

    const session = request.session!
    const inserted = await db.insert(comments).values({
      eventId: event.id,
      sessionId: session.id,
      userId: session.userId,
      displayName: body.displayName,
      body: body.body,
    }).returning()

    const comment = inserted[0]
    if (!comment) throw createError(500, 'INTERNAL_ERROR', 'Failed to post comment.')

    return reply.code(201).send({
      comment: {
        id: comment.id,
        displayName: comment.displayName,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      },
    })
  })

  fastify.delete('/api/events/:slug/comments/:commentId', async (request, reply) => {
    const { commentId } = request.params as { slug: string; commentId: string }

    const rows = await db
      .select({ id: comments.id, sessionId: comments.sessionId, userId: comments.userId })
      .from(comments)
      .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'COMMENT_NOT_FOUND', 'Comment not found.')

    const canDelete = request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub)

    if (!canDelete) throw createError(403, 'FORBIDDEN', 'Cannot delete this comment.')

    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId))
    return reply.code(204).send()
  })
}

export default commentsRoutes
