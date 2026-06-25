import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { directMessages, guestBlocks, guests, events, notifications, visitorSessions } from '../db/schema.js'
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { SendDmSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'
import { sendPushToSession } from '../services/push.js'

const DM_MAX_LENGTH = 2000

const dmsRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/dm/threads — all DM threads for the current guest, across all events
  fastify.get('/api/dm/threads', async (request, reply) => {
    if (!request.session) return reply.send({ threads: [] })

    const myGuestId = request.session.guestId ?? (request.user?.type === 'guest' ? request.user.sub : null)
    if (!myGuestId) return reply.send({ threads: [] })

    const rows = await db
      .select({
        id:          directMessages.id,
        eventId:     directMessages.eventId,
        fromGuestId: directMessages.fromGuestId,
        toGuestId:   directMessages.toGuestId,
        body:        directMessages.body,
        readAt:      directMessages.readAt,
        createdAt:   directMessages.createdAt,
        eventSlug:   events.slug,
        eventTitle:  events.title,
      })
      .from(directMessages)
      .innerJoin(events, eq(directMessages.eventId, events.id))
      .where(or(eq(directMessages.fromGuestId, myGuestId), eq(directMessages.toGuestId, myGuestId)))
      .orderBy(desc(directMessages.createdAt))
      .limit(500)

    // Group by (eventId, otherGuestId) — rows are newest-first so first occurrence is the latest message
    type ThreadAcc = {
      otherGuestId: string
      eventId: string
      eventSlug: string
      eventTitle: string
      lastMessage: string
      lastMessageAt: Date
      fromMe: boolean
      unreadCount: number
    }
    const threadMap = new Map<string, ThreadAcc>()

    for (const row of rows) {
      const otherGuestId = row.fromGuestId === myGuestId ? row.toGuestId : row.fromGuestId
      const key = `${row.eventId}:${otherGuestId}`

      if (!threadMap.has(key)) {
        threadMap.set(key, {
          otherGuestId,
          eventId:       row.eventId,
          eventSlug:     row.eventSlug,
          eventTitle:    row.eventTitle,
          lastMessage:   row.body,
          lastMessageAt: row.createdAt,
          fromMe:        row.fromGuestId === myGuestId,
          unreadCount:   0,
        })
      }

      if (row.toGuestId === myGuestId && row.readAt === null) {
        threadMap.get(key)!.unreadCount++
      }
    }

    const otherGuestIds = [...new Set([...threadMap.values()].map(t => t.otherGuestId))]
    const guestRows = otherGuestIds.length > 0
      ? await db
          .select({ id: guests.id, name: guests.name, avatarUrl: guests.avatarUrl })
          .from(guests)
          .where(inArray(guests.id, otherGuestIds))
      : []
    const guestMap = new Map(guestRows.map(g => [g.id, g]))

    const threads = [...threadMap.values()]
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .map(t => ({
        otherGuestId:     t.otherGuestId,
        otherGuestName:   guestMap.get(t.otherGuestId)?.name ?? 'Unknown',
        otherGuestAvatar: guestMap.get(t.otherGuestId)?.avatarUrl ?? null,
        eventId:          t.eventId,
        eventSlug:        t.eventSlug,
        eventTitle:       t.eventTitle,
        lastMessage:      t.lastMessage,
        lastMessageAt:    t.lastMessageAt.toISOString(),
        fromMe:           t.fromMe,
        unreadCount:      t.unreadCount,
      }))

    return reply.send({ threads })
  })

  // POST /api/events/:slug/dm — send a DM
  fastify.post('/api/events/:slug/dm', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    await ensureSession(request, reply)
    if (!request.session) throw createError(401, 'SESSION_REQUIRED', 'Session required.')

    const body = SendDmSchema.parse(request.body)

    const fromGuestId = request.session.guestId ?? (request.user?.type === 'guest' ? request.user.sub : null)
    if (!fromGuestId) throw createError(403, 'PROFILE_REQUIRED', 'Set up your guest profile to send messages.')

    // Verify sender's guest record exists
    const [fromGuest] = await db
      .select({ id: guests.id, name: guests.name })
      .from(guests)
      .where(eq(guests.id, fromGuestId))
      .limit(1)
    if (!fromGuest) throw createError(403, 'PROFILE_REQUIRED', 'Set up your guest profile to send messages.')

    if (body.toGuestId === fromGuestId) throw createError(400, 'SELF_MESSAGE', 'Cannot message yourself.')

    // Load event
    const [event] = await db
      .select({ id: events.id, title: events.title, slug: events.slug })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'Event not found.')

    // Verify recipient exists
    const [toGuest] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.id, body.toGuestId))
      .limit(1)
    if (!toGuest) throw createError(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found.')

    // Check recipient hasn't blocked the sender
    const [block] = await db
      .select({ id: guestBlocks.id })
      .from(guestBlocks)
      .where(and(
        eq(guestBlocks.eventId, event.id),
        eq(guestBlocks.blockingGuestId, body.toGuestId),
        eq(guestBlocks.blockedGuestId, fromGuestId),
      ))
      .limit(1)
    if (block) throw createError(403, 'BLOCKED', 'You cannot message this person.')

    const inserted = await db
      .insert(directMessages)
      .values({
        eventId:       event.id,
        fromGuestId,
        toGuestId:     body.toGuestId,
        fromSessionId: request.session.id,
        body:          body.body.slice(0, DM_MAX_LENGTH),
      })
      .returning()
    const newMessage = inserted[0]!

    // Notify recipient
    const [recipientSession] = await db
      .select({ id: visitorSessions.id })
      .from(visitorSessions)
      .where(eq(visitorSessions.guestId, body.toGuestId))
      .limit(1)

    if (recipientSession) {
      await db.insert(notifications).values({
        sessionId: recipientSession.id,
        eventId:   event.id,
        type:      'new_message',
        body:      `${fromGuest.name} sent you a message at "${event.title}".`,
        link:      `/event/${slug}`,
      })
      void sendPushToSession(recipientSession.id, body.toGuestId, {
        title:  `💬 Message from ${fromGuest.name}`,
        body:   body.body.slice(0, 100),
        link:   `/event/${slug}`,
      })
    }

    return reply.code(201).send({
      message: {
        id:        newMessage.id,
        body:      newMessage.body,
        createdAt: newMessage.createdAt.toISOString(),
      },
    })
  })

  // GET /api/events/:slug/dm/:guestId — fetch thread between caller and target
  fastify.get('/api/events/:slug/dm/:guestId', async (request, reply) => {
    const { slug, guestId: targetGuestId } = request.params as { slug: string; guestId: string }

    if (!request.session) return reply.send({ messages: [] })

    const myGuestId = request.session.guestId ?? (request.user?.type === 'guest' ? request.user.sub : null)
    if (!myGuestId) return reply.send({ messages: [] })

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'Event not found.')

    // Check if caller has blocked target (or target has blocked caller)
    const [block] = await db
      .select({ id: guestBlocks.id })
      .from(guestBlocks)
      .where(and(
        eq(guestBlocks.eventId, event.id),
        or(
          and(eq(guestBlocks.blockingGuestId, myGuestId), eq(guestBlocks.blockedGuestId, targetGuestId)),
          and(eq(guestBlocks.blockingGuestId, targetGuestId), eq(guestBlocks.blockedGuestId, myGuestId)),
        ),
      ))
      .limit(1)

    const rows = await db
      .select({
        id:          directMessages.id,
        fromGuestId: directMessages.fromGuestId,
        body:        directMessages.body,
        readAt:      directMessages.readAt,
        createdAt:   directMessages.createdAt,
      })
      .from(directMessages)
      .where(and(
        eq(directMessages.eventId, event.id),
        or(
          and(eq(directMessages.fromGuestId, myGuestId), eq(directMessages.toGuestId, targetGuestId)),
          and(eq(directMessages.fromGuestId, targetGuestId), eq(directMessages.toGuestId, myGuestId)),
        ),
      ))
      .orderBy(desc(directMessages.createdAt))
      .limit(50)

    // Mark unread incoming messages as read
    const unread = rows.filter(r => r.fromGuestId === targetGuestId && r.readAt === null)
    if (unread.length > 0) {
      await db
        .update(directMessages)
        .set({ readAt: new Date() })
        .where(and(
          eq(directMessages.eventId, event.id),
          eq(directMessages.fromGuestId, targetGuestId),
          eq(directMessages.toGuestId, myGuestId),
        ))
    }

    return reply.send({
      messages: rows.reverse().map(r => ({
        id:        r.id,
        fromMe:    r.fromGuestId === myGuestId,
        body:      r.body,
        readAt:    r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      blocked: !!block,
    })
  })

  // POST /api/events/:slug/dm/:guestId/block — block a guest (stop receiving their messages)
  fastify.post('/api/events/:slug/dm/:guestId/block', async (request, reply) => {
    const { slug, guestId: targetGuestId } = request.params as { slug: string; guestId: string }

    await ensureSession(request, reply)
    if (!request.session) throw createError(401, 'SESSION_REQUIRED', 'Session required.')

    const myGuestId = request.session.guestId ?? (request.user?.type === 'guest' ? request.user.sub : null)
    if (!myGuestId) throw createError(403, 'PROFILE_REQUIRED', 'Profile required to block.')

    if (targetGuestId === myGuestId) throw createError(400, 'SELF_BLOCK', 'Cannot block yourself.')

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'Event not found.')

    await db
      .insert(guestBlocks)
      .values({ eventId: event.id, blockingGuestId: myGuestId, blockedGuestId: targetGuestId })
      .onConflictDoNothing()

    return reply.code(204).send()
  })

  // DELETE /api/events/:slug/dm/:guestId/block — unblock a guest
  fastify.delete('/api/events/:slug/dm/:guestId/block', async (request, reply) => {
    const { slug, guestId: targetGuestId } = request.params as { slug: string; guestId: string }

    if (!request.session) return reply.code(204).send()

    const myGuestId = request.session.guestId ?? (request.user?.type === 'guest' ? request.user.sub : null)
    if (!myGuestId) return reply.code(204).send()

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) return reply.code(204).send()

    await db
      .delete(guestBlocks)
      .where(and(
        eq(guestBlocks.eventId, event.id),
        eq(guestBlocks.blockingGuestId, myGuestId),
        eq(guestBlocks.blockedGuestId, targetGuestId),
      ))

    return reply.code(204).send()
  })

  // GET /api/events/:slug/dms — host view: all threads for an event
  fastify.get('/api/events/:slug/dms', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'Event not found.')

    // Return all messages for the event, ordered by time, with sender/recipient names
    const rows = await db
      .select({
        id:          directMessages.id,
        fromGuestId: directMessages.fromGuestId,
        toGuestId:   directMessages.toGuestId,
        body:        directMessages.body,
        readAt:      directMessages.readAt,
        createdAt:   directMessages.createdAt,
        senderName:  guests.name,
      })
      .from(directMessages)
      .innerJoin(guests, eq(directMessages.fromGuestId, guests.id))
      .where(eq(directMessages.eventId, event.id))
      .orderBy(desc(directMessages.createdAt))
      .limit(200)

    return reply.send({
      messages: rows.map(r => ({
        id:          r.id,
        fromGuestId: r.fromGuestId,
        toGuestId:   r.toGuestId,
        senderName:  r.senderName,
        body:        r.body,
        readAt:      r.readAt?.toISOString() ?? null,
        createdAt:   r.createdAt.toISOString(),
      })),
    })
  })
}

export default dmsRoutes
