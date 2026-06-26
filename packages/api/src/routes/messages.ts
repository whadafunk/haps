import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, eventMessages, deliveryJobs, rsvps, notifications, users, visitorSessions } from '../db/schema.js'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateEventMessageSchema, BlastSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'
import { sendBulkPush } from '../services/push.js'

const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/events/:slug/messages — public feed for the event channel
  fastify.get('/api/events/:slug/messages', async (request) => {
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
        id: eventMessages.id,
        displayName: eventMessages.displayName,
        subject: eventMessages.subject,
        body: eventMessages.body,
        type: eventMessages.type,
        createdAt: eventMessages.createdAt,
      })
      .from(eventMessages)
      .where(and(eq(eventMessages.eventId, event.id), isNull(eventMessages.deletedAt)))
      .orderBy(eventMessages.createdAt)

    return {
      messages: rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
    }
  })

  // POST /api/events/:slug/messages — any yes/maybe RSVP or editor can post
  fastify.post('/api/events/:slug/messages', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await ensureSession(request, reply)

    const body = CreateEventMessageSchema.parse(request.body)

    const eventRows = await db
      .select({ id: events.id, status: events.status })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (event.status !== 'published') throw createError(403, 'EVENT_NOT_PUBLISHED', 'Event is not published.')

    const session = request.session!

    // Must be editor, or have a yes/maybe RSVP
    if (!request.isEditor) {
      const rsvpRows = await db
        .select({ status: rsvps.status })
        .from(rsvps)
        .where(and(
          eq(rsvps.eventId, event.id),
          session.userId ? eq(rsvps.userId, session.userId) : eq(rsvps.sessionId, session.id),
          inArray(rsvps.status, ['yes', 'maybe']),
        ))
        .limit(1)

      if (!rsvpRows[0]) {
        throw createError(403, 'RSVP_REQUIRED', 'You must have a yes or maybe RSVP to post messages.')
      }
    }

    const [inserted] = await db.insert(eventMessages).values({
      eventId: event.id,
      sessionId: session.id,
      userId: session.userId ?? null,
      displayName: body.displayName,
      body: body.body,
      type: 'message',
    }).returning()

    if (!inserted) throw createError(500, 'INTERNAL_ERROR', 'Failed to post message.')

    return reply.code(201).send({
      message: {
        id: inserted.id,
        displayName: inserted.displayName,
        subject: inserted.subject,
        body: inserted.body,
        type: inserted.type,
        createdAt: inserted.createdAt.toISOString(),
      },
    })
  })

  // POST /api/events/:slug/blast — organizer only; creates in-app message + delivers to guest inboxes
  fastify.post('/api/events/:slug/blast', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id, status: events.status, organizerId: events.organizerId })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    if (!request.isEditor) throw createError(403, 'FORBIDDEN', 'Only the event organizer can send blasts.')

    const body = BlastSchema.parse(request.body)

    const organizerRows = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, event.organizerId))
      .limit(1)
    const senderName = organizerRows[0]?.displayName ?? 'Organizer'

    // Keep event message record for the host's Updates tab sent history
    const [blastMessage] = await db.insert(eventMessages).values({
      eventId: event.id,
      sessionId: request.session?.id ?? null,
      userId: request.user?.sub ?? null,
      displayName: senderName,
      subject: body.subject,
      body: body.body,
      type: 'blast',
    }).returning({ id: eventMessages.id })

    if (!blastMessage) throw createError(500, 'INTERNAL_ERROR', 'Failed to create blast.')

    // Deliver to the inbox of all yes/maybe RSVPs
    const recipients = await db
      .select({ sessionId: rsvps.sessionId, userId: rsvps.userId, guestId: rsvps.guestId })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), inArray(rsvps.status, ['yes', 'maybe'])))

    const inboxRows: (typeof notifications.$inferInsert)[] = []
    const notifBase = { eventId: event.id, type: 'announcement', senderName, subject: body.subject, body: body.body, link: `/event/${slug}`, read: false }

    for (const r of recipients) {
      if (r.sessionId || r.userId) {
        inboxRows.push({ ...notifBase, sessionId: r.sessionId ?? null, userId: r.userId ?? null })
      } else if (r.guestId) {
        // RSVP created via logged-in JWT path — no sessionId/userId on the RSVP.
        // Resolve the guest's active sessions so the inbox receives the notification.
        const guestSessions = await db
          .select({ id: visitorSessions.id })
          .from(visitorSessions)
          .where(eq(visitorSessions.guestId, r.guestId))
        for (const s of guestSessions) {
          inboxRows.push({ ...notifBase, sessionId: s.id, userId: null })
        }
      }
    }

    if (inboxRows.length > 0) {
      await db.insert(notifications).values(inboxRows)
    }

    // Queue external delivery jobs when channels are selected (email/sms)
    let queued = 0
    if (body.channels.includes('email') || body.channels.includes('sms')) {
      const eligibleRsvps = await db
        .select({ displayName: rsvps.displayName, email: rsvps.email })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), inArray(rsvps.status, ['yes', 'maybe'])))

      const jobs: (typeof deliveryJobs.$inferInsert)[] = []
      for (const rsvp of eligibleRsvps) {
        if (body.channels.includes('email') && rsvp.email) {
          jobs.push({
            eventMessageId: blastMessage.id,
            channel: 'email',
            recipientEmail: rsvp.email,
            recipientName: rsvp.displayName,
            status: 'pending',
          })
        }
      }
      if (jobs.length > 0) {
        await db.insert(deliveryJobs).values(jobs)
        queued = jobs.length
      }
    }

    // Push notification delivery — fire and forget
    if (body.channels.includes('push')) {
      const pushSessionIds = new Set<string>()

      for (const r of recipients) {
        if (r.sessionId) pushSessionIds.add(r.sessionId)
      }

      // Resolve userId → sessions for JWT-RSVPd guests
      const userIds = recipients.map(r => r.userId).filter(Boolean) as string[]
      if (userIds.length > 0) {
        const userSessions = await db
          .select({ id: visitorSessions.id })
          .from(visitorSessions)
          .where(inArray(visitorSessions.userId, userIds))
        for (const s of userSessions) pushSessionIds.add(s.id)
      }

      // Resolve guestId → sessions
      const guestIds = recipients.map(r => r.guestId).filter(Boolean) as string[]
      if (guestIds.length > 0) {
        const guestSessions = await db
          .select({ id: visitorSessions.id })
          .from(visitorSessions)
          .where(inArray(visitorSessions.guestId, guestIds))
        for (const s of guestSessions) pushSessionIds.add(s.id)
      }

      if (pushSessionIds.size > 0) {
        const pushSent = await sendBulkPush([...pushSessionIds], { title: body.subject, body: body.body, link: `/event/${slug}` })
        queued += pushSent
      }
    }

    return reply.code(201).send({ queued })
  })

  // DELETE /api/events/:slug/messages/:messageId — soft delete; editor or owner
  fastify.delete('/api/events/:slug/messages/:messageId', async (request, reply) => {
    const { messageId } = request.params as { slug: string; messageId: string }

    const rows = await db
      .select({ id: eventMessages.id, sessionId: eventMessages.sessionId, userId: eventMessages.userId })
      .from(eventMessages)
      .where(and(eq(eventMessages.id, messageId), isNull(eventMessages.deletedAt)))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'MESSAGE_NOT_FOUND', 'Message not found.')

    const canDelete = request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub)

    if (!canDelete) throw createError(403, 'FORBIDDEN', 'Cannot delete this message.')

    await db.update(eventMessages).set({ deletedAt: new Date() }).where(eq(eventMessages.id, messageId))
    return reply.code(204).send()
  })
}

export default messagesRoutes
