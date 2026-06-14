import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, rsvps, visitorSessions, emailBlocklist, contacts } from '../db/schema.js'
import { eq, and, count } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateRsvpSchema, UpdateRsvpSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'

const rsvpsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/events/:slug/rsvps', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await ensureSession(request, reply)

    const body = CreateRsvpSchema.parse(request.body)

    const session = request.session!

    // Blocked / removed sessions cannot RSVP
    if (session.status === 'blocked' || session.status === 'removed') {
      throw createError(403, 'GUEST_BLOCKED', session.statusReason ?? 'You have been blocked from this platform.')
    }

    // Profile gate: only for anonymous guests — registered users already have an account email
    if (!session.email && !session.userId) {
      throw createError(428, 'PROFILE_REQUIRED', 'Please complete your profile before RSVPing.')
    }

    // Email blocklist check
    if (body.email) {
      const [blocked] = await db
        .select({ id: emailBlocklist.id })
        .from(emailBlocklist)
        .where(eq(emailBlocklist.email, body.email.toLowerCase()))
        .limit(1)
      if (blocked) throw createError(403, 'EMAIL_BLOCKED', 'This email address has been blocked.')
    }

    const eventRows = await db
      .select({ id: events.id, status: events.status, eventType: events.eventType, maxCapacity: events.maxCapacity, rsvpDeadline: events.rsvpDeadline })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    if (event.status !== 'published') throw createError(403, 'EVENT_NOT_PUBLISHED', 'Event is not open for RSVPs.')
    if (event.rsvpDeadline && new Date() > event.rsvpDeadline) {
      throw createError(403, 'RSVP_DEADLINE_PASSED', 'RSVP deadline has passed.')
    }

    // Invite-only events require an attendee token to have been claimed in this session
    if (event.eventType === 'invite_only') {
      const access = session.eventAccess?.[slug]
      if (access !== 'attendee' && access !== 'editor') {
        throw createError(403, 'TOKEN_REQUIRED', 'An invite link is required to RSVP to this event.')
      }
    }

    let rsvpStatus: string = body.status
    if (body.status === 'yes' && event.maxCapacity) {
      const countRows = await db
        .select({ yesCount: count() })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'yes')))
      const yesCount = Number(countRows[0]?.yesCount ?? 0)
      if (yesCount >= event.maxCapacity) {
        rsvpStatus = 'waitlist'
      }
    }

    if (!session.displayName) {
      await db
        .update(visitorSessions)
        .set({ displayName: body.displayName, email: body.email ?? null })
        .where(eq(visitorSessions.id, session.id))
      session.displayName = body.displayName
    }

    const inserted = await db
      .insert(rsvps)
      .values({
        eventId:     event.id,
        sessionId:   session.id,
        userId:      session.userId,
        displayName: body.displayName,
        email:       body.email ?? null,
        status:      rsvpStatus,
        headCount:   body.headCount,
        note:        body.note ?? null,
      })
      .onConflictDoUpdate({
        target: [rsvps.eventId, rsvps.sessionId],
        set: {
          displayName: body.displayName,
          email:       body.email ?? null,
          status:      rsvpStatus,
          headCount:   body.headCount,
          note:        body.note ?? null,
          updatedAt:   new Date(),
        },
      })
      .returning()

    const rsvp = inserted[0]
    if (!rsvp) throw createError(500, 'INTERNAL_ERROR', 'Failed to create RSVP.')

    // Track event access in session so it shows up on "My Events"
    const currentAccess = (session.eventAccess ?? {}) as Record<string, string>
    if (!currentAccess[slug]) {
      const updatedAccess = { ...currentAccess, [slug]: 'attendee' }
      await db
        .update(visitorSessions)
        .set({ eventAccess: updatedAccess })
        .where(eq(visitorSessions.id, session.id))
      session.eventAccess = updatedAccess as Record<string, 'attendee' | 'editor'>
    }

    // Auto-upsert contact from RSVP data when an email is known
    const rsvpEmail = body.email ?? session.email
    if (rsvpEmail) {
      await db.insert(contacts)
        .values({ name: body.displayName, email: rsvpEmail.toLowerCase() })
        .onConflictDoUpdate({
          target: contacts.email,
          set: { name: body.displayName, updatedAt: new Date() },
        })
    }

    return reply.code(201).send({ rsvp: serializeRsvp(rsvp) })
  })

  fastify.patch('/api/events/:slug/rsvps/:rsvpId', async (request) => {
    const { rsvpId } = request.params as { slug: string; rsvpId: string }
    const body = UpdateRsvpSchema.parse(request.body)

    const rows = await db
      .select({ id: rsvps.id, sessionId: rsvps.sessionId, userId: rsvps.userId })
      .from(rsvps)
      .where(eq(rsvps.id, rsvpId))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'RSVP_NOT_FOUND', 'RSVP not found.')

    const canEdit = request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub)

    if (!canEdit) throw createError(403, 'FORBIDDEN', 'Cannot modify this RSVP.')

    const updates: Partial<typeof rsvps.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() }
    if (body.status !== undefined) updates.status = body.status
    if (body.headCount !== undefined) updates.headCount = body.headCount
    if (body.note !== undefined) updates.note = body.note ?? null

    const updated = await db.update(rsvps).set(updates).where(eq(rsvps.id, rsvpId)).returning()
    const rsvp = updated[0]
    if (!rsvp) throw createError(404, 'RSVP_NOT_FOUND', 'RSVP not found.')

    return { rsvp: serializeRsvp(rsvp) }
  })

  fastify.delete('/api/events/:slug/rsvps/:rsvpId', async (request, reply) => {
    const { rsvpId } = request.params as { slug: string; rsvpId: string }

    const rows = await db
      .select({ id: rsvps.id, sessionId: rsvps.sessionId, userId: rsvps.userId })
      .from(rsvps)
      .where(eq(rsvps.id, rsvpId))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'RSVP_NOT_FOUND', 'RSVP not found.')

    const canDelete = request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub)

    if (!canDelete) throw createError(403, 'FORBIDDEN', 'Cannot delete this RSVP.')

    await db.delete(rsvps).where(eq(rsvps.id, rsvpId))
    return reply.code(204).send()
  })

  fastify.get('/api/events/:slug/rsvps', async (request) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id, showGuests: events.showGuests })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const isEditor = request.isEditor ||
      request.user?.role === 'admin' || request.user?.role === 'organizer'

    if (!isEditor && !event.showGuests) {
      throw createError(403, 'FORBIDDEN', 'Guest list is not public for this event.')
    }

    const rows = await db
      .select({
        id:          rsvps.id,
        displayName: rsvps.displayName,
        status:      rsvps.status,
        headCount:   rsvps.headCount,
        note:        rsvps.note,
        checkedIn:   rsvps.checkedIn,
        email:       rsvps.email,
        sessionId:   rsvps.sessionId,
        createdAt:   rsvps.createdAt,
        sessionStatus: visitorSessions.status,
      })
      .from(rsvps)
      .leftJoin(visitorSessions, eq(rsvps.sessionId, visitorSessions.id))
      .where(eq(rsvps.eventId, event.id))

    // Filter out blocked/removed session guests from the public list
    const visible = isEditor
      ? rows
      : rows.filter((r) => !r.sessionId || (r.sessionStatus ?? 'active') === 'active')

    return {
      rsvps: visible.map((r) => ({
        id:          r.id,
        displayName: r.displayName,
        status:      r.status,
        headCount:   r.headCount,
        note:        r.note,
        checkedIn:   r.checkedIn,
        createdAt:   r.createdAt.toISOString(),
        ...(isEditor ? { email: r.email } : {}),
      })),
    }
  })
}

function serializeRsvp(rsvp: typeof rsvps.$inferSelect) {
  return {
    id:          rsvp.id,
    status:      rsvp.status,
    headCount:   rsvp.headCount,
    note:        rsvp.note,
    displayName: rsvp.displayName,
    checkedIn:   rsvp.checkedIn,
    createdAt:   rsvp.createdAt.toISOString(),
    updatedAt:   rsvp.updatedAt.toISOString(),
  }
}

export default rsvpsRoutes
