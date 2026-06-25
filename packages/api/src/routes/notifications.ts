import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { notifications, visitorSessions, events, directMessages } from '../db/schema.js'
import { eq, and, or, inArray, desc, isNull, ne } from 'drizzle-orm'
import { createError } from '../lib/errors.js'

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/notifications — list for current session (+ all sessions if claimed user)
  fastify.get('/api/notifications', async (request) => {
    const session = request.session
    if (!session) throw createError(401, 'NO_SESSION', 'No session found.')

    const conditions = [eq(notifications.sessionId, session.id)]

    // If the session belongs to a claimed guest, also fetch notifications from
    // all other sessions linked to the same guest
    if (session.guestId) {
      const siblingSessionIds = await db
        .select({ id: visitorSessions.id })
        .from(visitorSessions)
        .where(and(eq(visitorSessions.guestId, session.guestId)))
        .then(rows => rows.map(r => r.id))

      if (siblingSessionIds.length > 1) {
        conditions[0] = inArray(notifications.sessionId, siblingSessionIds)
      }
    }

    // Operators also get notifications by userId
    if (session.userId) {
      conditions.push(eq(notifications.userId, session.userId))
    }

    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        senderName: notifications.senderName,
        subject: notifications.subject,
        body: notifications.body,
        link: notifications.link,
        read: notifications.read,
        createdAt: notifications.createdAt,
        eventId: notifications.eventId,
        eventTitle: events.title,
        eventSlug: events.slug,
      })
      .from(notifications)
      .leftJoin(events, eq(events.id, notifications.eventId))
      .where(and(or(...conditions), ne(notifications.type, 'new_message')))
      .orderBy(desc(notifications.createdAt))
      .limit(100)

    const unreadCount = rows.filter(n => !n.read).length

    // Unread DMs (messages addressed to this guest that haven't been read)
    let unreadDmCount = 0
    if (session.guestId) {
      const unreadDms = await db
        .select({ id: directMessages.id })
        .from(directMessages)
        .where(and(eq(directMessages.toGuestId, session.guestId), isNull(directMessages.readAt)))
      unreadDmCount = unreadDms.length
    }

    return {
      notifications: rows.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })),
      unreadCount,
      unreadDmCount,
    }
  })

  // PATCH /api/notifications/:id/read — mark one read
  fastify.patch('/api/notifications/:id/read', async (request, reply) => {
    const session = request.session
    if (!session) throw createError(401, 'NO_SESSION', 'No session found.')
    const { id } = request.params as { id: string }

    const [notif] = await db
      .select({ id: notifications.id, sessionId: notifications.sessionId, userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1)

    if (!notif) throw createError(404, 'NOT_FOUND', 'Notification not found.')

    const ownedBySession = notif.sessionId === session.id
    const ownedByUser = notif.userId && notif.userId === session.userId

    // Also allow if it belongs to a sibling session for claimed guests
    let ownedBySibling = false
    if (!ownedBySession && !ownedByUser && session.guestId && notif.sessionId) {
      const [sibling] = await db
        .select({ id: visitorSessions.id })
        .from(visitorSessions)
        .where(and(eq(visitorSessions.id, notif.sessionId), eq(visitorSessions.guestId, session.guestId)))
        .limit(1)
      ownedBySibling = !!sibling
    }

    if (!ownedBySession && !ownedByUser && !ownedBySibling) {
      throw createError(403, 'FORBIDDEN', 'Not your notification.')
    }

    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id))
    return reply.code(204).send()
  })

  // POST /api/notifications/read-all — mark all read for current session
  fastify.post('/api/notifications/read-all', async (request, reply) => {
    const session = request.session
    if (!session) throw createError(401, 'NO_SESSION', 'No session found.')

    const conditions = [eq(notifications.sessionId, session.id)]

    if (session.guestId) {
      const siblingSessionIds = await db
        .select({ id: visitorSessions.id })
        .from(visitorSessions)
        .where(eq(visitorSessions.guestId, session.guestId))
        .then(rows => rows.map(r => r.id))

      if (siblingSessionIds.length > 1) {
        conditions[0] = inArray(notifications.sessionId, siblingSessionIds)
      }
    }

    if (session.userId) {
      conditions.push(eq(notifications.userId, session.userId))
    }

    await db.update(notifications).set({ read: true }).where(or(...conditions))
    return reply.code(204).send()
  })
}

export default notificationsRoutes
