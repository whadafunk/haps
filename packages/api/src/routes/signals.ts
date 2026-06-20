import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, guestSignals, guests, notifications, rsvps, visitorSessions } from '../db/schema.js'
import { eq, and, count } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { SendSignalSchema } from '@haps/shared'
import { ensureSession, hasAttendeeAccess } from '../middleware/session.js'
import { sendPushToSession } from '../services/push.js'

const CRUSH_LIMIT_PER_EVENT = 3

const signalsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/events/:slug/signals — send a wink or crush
  fastify.post('/api/events/:slug/signals', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    await ensureSession(request, reply)
    if (!request.session) throw createError(401, 'SESSION_REQUIRED', 'Session required.')

    const body = SendSignalSchema.parse(request.body)

    // Resolve the sender's guestId
    const fromGuestId = request.session.guestId ?? (request.user?.type === 'guest' ? request.user.sub : null)
    if (!fromGuestId) {
      throw createError(403, 'PROFILE_REQUIRED', 'Set up your guest profile to send signals.')
    }

    // Verify the sender's guest record exists and is claimed
    const [fromGuest] = await db
      .select({ id: guests.id, name: guests.name, claimedAt: guests.claimedAt })
      .from(guests)
      .where(eq(guests.id, fromGuestId))
      .limit(1)
    if (!fromGuest?.claimedAt) {
      throw createError(403, 'PROFILE_REQUIRED', 'Complete your guest profile to send signals.')
    }

    // Load event
    const [event] = await db
      .select({ id: events.id, title: events.title, slug: events.slug, status: events.status, eventType: events.eventType })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'Event not found.')

    // Check attendee access for invite-only events
    if (event.eventType === 'invite_only') {
      const access = request.session.eventAccess?.[slug]
      if (access !== 'attendee' && access !== 'editor' && !hasAttendeeAccess(access)) {
        throw createError(403, 'TOKEN_REQUIRED', 'Attendee access required.')
      }
    }

    // Cannot send a signal to yourself
    if (body.toGuestId === fromGuestId) {
      throw createError(400, 'SELF_SIGNAL', 'Cannot send a signal to yourself.')
    }

    // Verify recipient guest exists and is claimed
    const [toGuest] = await db
      .select({ id: guests.id, claimedAt: guests.claimedAt })
      .from(guests)
      .where(eq(guests.id, body.toGuestId))
      .limit(1)
    if (!toGuest?.claimedAt) {
      throw createError(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found.')
    }

    // Per-event crush limit
    if (body.type === 'crush') {
      const crushRows = await db
        .select({ crushCount: count() })
        .from(guestSignals)
        .where(and(
          eq(guestSignals.fromGuestId, fromGuestId),
          eq(guestSignals.eventId, event.id),
          eq(guestSignals.type, 'crush'),
        ))
      const crushCount = crushRows[0]?.crushCount ?? 0
      if (crushCount >= CRUSH_LIMIT_PER_EVENT) {
        throw createError(429, 'CRUSH_LIMIT_REACHED', `You can only crush on ${CRUSH_LIMIT_PER_EVENT} people per event.`)
      }
    }

    // Insert (or update existing — replace signal)
    let mutualReveal = false
    let newSignalId: string | null = null

    await db.transaction(async (tx) => {
      // Insert the signal (conflict = already sent this type to this person at this event — no-op)
      const inserted = await tx
        .insert(guestSignals)
        .values({
          fromSessionId: request.session!.id,
          fromGuestId,
          toGuestId: body.toGuestId,
          eventId: event.id,
          type: body.type,
          eventContext: event.title,
        })
        .onConflictDoNothing()
        .returning({ id: guestSignals.id, revealed: guestSignals.revealed })

      if (!inserted[0]) {
        // Signal already existed — no notification re-sent
        return
      }
      newSignalId = inserted[0].id

      // Check mutual crush
      if (body.type === 'crush') {
        const [reverse] = await tx
          .select({ id: guestSignals.id })
          .from(guestSignals)
          .where(and(
            eq(guestSignals.fromGuestId, body.toGuestId),
            eq(guestSignals.toGuestId, fromGuestId),
            eq(guestSignals.eventId, event.id),
            eq(guestSignals.type, 'crush'),
          ))
          .limit(1)

        if (reverse) {
          // Mutual! Reveal both
          mutualReveal = true
          await tx
            .update(guestSignals)
            .set({ revealed: true })
            .where(and(
              eq(guestSignals.fromGuestId, body.toGuestId),
              eq(guestSignals.toGuestId, fromGuestId),
              eq(guestSignals.eventId, event.id),
              eq(guestSignals.type, 'crush'),
            ))
          await tx
            .update(guestSignals)
            .set({ revealed: true })
            .where(eq(guestSignals.id, newSignalId!))
        }
      }
    })

    if (!newSignalId) {
      // Already sent — idempotent OK
      return reply.code(200).send({ signal: { type: body.type, mutualReveal: false } })
    }

    // Find the recipient's primary session for notification delivery
    const [recipientSession] = await db
      .select({ id: visitorSessions.id, guestId: visitorSessions.guestId })
      .from(visitorSessions)
      .where(eq(visitorSessions.guestId, body.toGuestId))
      .limit(1)

    if (mutualReveal) {
      // Notify both parties of the mutual crush reveal

      // Notify the recipient: their crush is mutual
      if (recipientSession) {
        await db.insert(notifications).values({
          sessionId: recipientSession.id,
          eventId: event.id,
          type: 'crush_revealed',
          body: `Your crush on ${fromGuest.name} at "${event.title}" is mutual! 💞`,
          link: `/event/${slug}`,
        })
        void sendPushToSession(recipientSession.id, body.toGuestId, {
          title: '💞 Mutual crush!',
          body: `Your crush on ${fromGuest.name} at "${event.title}" is mutual!`,
          link: `/event/${slug}`,
        })
      }

      // Notify the sender: their crush was just revealed as mutual
      await db.insert(notifications).values({
        sessionId: request.session.id,
        eventId: event.id,
        type: 'crush_revealed',
        body: `Your crush at "${event.title}" is mutual! 💞`,
        link: `/event/${slug}`,
      })
      void sendPushToSession(request.session.id, fromGuestId, {
        title: '💞 Mutual crush!',
        body: `Your crush at "${event.title}" is mutual!`,
        link: `/event/${slug}`,
      })
    } else {
      // Notify the recipient of the new signal
      const signalLabel = body.type === 'wink' ? 'a wink 👋' : 'a crush 💌'
      if (recipientSession) {
        await db.insert(notifications).values({
          sessionId: recipientSession.id,
          eventId: event.id,
          type: 'new_signal',
          body: `Someone sent you ${signalLabel} at "${event.title}".`,
          link: `/event/${slug}`,
        })
        void sendPushToSession(recipientSession.id, body.toGuestId, {
          title: body.type === 'wink' ? '👋 Someone winked at you' : '💌 Someone has a crush on you',
          body: `At "${event.title}"`,
          link: `/event/${slug}`,
        })
      }
    }

    return reply.code(201).send({ signal: { type: body.type, mutualReveal } })
  })

  // GET /api/events/:slug/signals/sent — my sent signals at this event
  fastify.get('/api/events/:slug/signals/sent', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    if (!request.session) return { signals: [] }

    const fromGuestId = request.session.guestId ?? (request.user?.type === 'guest' ? request.user.sub : null)
    if (!fromGuestId) return { signals: [] }

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) return { signals: [] }

    // Load sent signals with recipient info
    const rows = await db
      .select({
        id: guestSignals.id,
        toGuestId: guestSignals.toGuestId,
        type: guestSignals.type,
        revealed: guestSignals.revealed,
        createdAt: guestSignals.createdAt,
        recipientName: guests.name,
        recipientAvatarUrl: guests.avatarUrl,
      })
      .from(guestSignals)
      .innerJoin(guests, eq(guestSignals.toGuestId, guests.id))
      .where(and(
        eq(guestSignals.fromGuestId, fromGuestId),
        eq(guestSignals.eventId, event.id),
      ))

    return {
      signals: rows.map(r => ({
        id: r.id,
        toGuestId: r.toGuestId,
        type: r.type,
        revealed: r.revealed,
        recipientName: r.revealed ? r.recipientName : null,
        recipientAvatarUrl: r.revealed ? r.recipientAvatarUrl : null,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  })
}

export default signalsRoutes
