import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, rsvps, visitorSessions, emailBlocklist, guests, notifications } from '../db/schema.js'
import { eq, and, count, asc } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateRsvpSchema, UpdateRsvpSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'

const rsvpsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/events/:slug/rsvps', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const body = CreateRsvpSchema.parse(request.body)
    const isLoggedIn = !!request.user

    // ── Logged-in path ────────────────────────────────────────────────────
    if (isLoggedIn) {
      const user = request.user!

      let guestRecord: { id: string; name: string; email: string } | undefined

      if (user.type === 'guest') {
        // request.user.sub IS the guest ID
        const [g] = await db
          .select({ id: guests.id, name: guests.name, email: guests.email })
          .from(guests)
          .where(eq(guests.id, user.sub))
          .limit(1)
        guestRecord = g
      } else {
        // Operator: look up their linked guest entry
        const [g] = await db
          .select({ id: guests.id, name: guests.name, email: guests.email })
          .from(guests)
          .where(eq(guests.userId, user.sub))
          .limit(1)
        guestRecord = g
      }

      if (!guestRecord) {
        throw createError(403, 'NO_IDENTITY_LINKED', 'Set up your guest identity in account settings before RSVPing.')
      }

      const lockedName = guestRecord.name
      const lockedEmail = guestRecord.email

      // Email blocklist check
      const [blocked] = await db
        .select({ id: emailBlocklist.id })
        .from(emailBlocklist)
        .where(eq(emailBlocklist.email, lockedEmail.toLowerCase()))
        .limit(1)
      if (blocked) throw createError(403, 'EMAIL_BLOCKED', 'This email address has been blocked.')

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

      let rsvpStatus: string = body.status
      if (body.status === 'yes' && event.maxCapacity) {
        const [countRow] = await db
          .select({ yesCount: count() })
          .from(rsvps)
          .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'yes')))
        const yesCount = Number(countRow?.yesCount ?? 0)
        if (yesCount >= event.maxCapacity) rsvpStatus = 'waitlist'
      }

      // Find existing RSVP for this guest
      const [existingRsvp] = await db
        .select({ id: rsvps.id })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.guestId, guestRecord.id)))
        .limit(1)

      let rsvp
      if (existingRsvp) {
        const updated = await db.update(rsvps)
          .set({
            displayName: lockedName,
            email:       lockedEmail,
            status:      rsvpStatus,
            headCount:   body.headCount,
            note:        body.note ?? null,
            guestId:     guestRecord.id,
            updatedAt:   new Date(),
          })
          .where(eq(rsvps.id, existingRsvp.id))
          .returning()
        rsvp = updated[0]
      } else {
        const inserted = await db.insert(rsvps)
          .values({
            eventId:     event.id,
            userId:      user.type === 'operator' ? user.sub : null,
            guestId:     guestRecord.id,
            displayName: lockedName,
            email:       lockedEmail,
            status:      rsvpStatus,
            headCount:   body.headCount,
            note:        body.note ?? null,
          })
          .returning()
        rsvp = inserted[0]
      }
      if (!rsvp) throw createError(500, 'INTERNAL_ERROR', 'Failed to create RSVP.')

      return reply.code(201).send({ rsvp: serializeRsvp(rsvp) })
    }

    // ── Anonymous path ────────────────────────────────────────────────────
    await ensureSession(request, reply)
    const session = request.session!

    // Validate that anonymous users provide displayName and email
    if (!body.displayName) throw createError(400, 'VALIDATION_ERROR', 'displayName is required.')
    if (!body.email) throw createError(400, 'VALIDATION_ERROR', 'email is required.')

    // Blocked / removed sessions cannot RSVP
    if (session.status === 'blocked' || session.status === 'removed') {
      throw createError(403, 'GUEST_BLOCKED', session.statusReason ?? 'You have been blocked from this platform.')
    }

    const rsvpEmail = (session.email ?? body.email).toLowerCase()

    // Event lookup first (before email checks) so 404 is returned for unknown events
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

    // Identity lock: if session has a cached email and body provides a different email → reject
    if (session.email && body.email && session.email.toLowerCase() !== body.email.toLowerCase()) {
      throw createError(403, 'IDENTITY_LOCKED', 'Your identity is locked to the email on your session.')
    }

    // Email clash: if session has NO cached email and submitted email already exists in guests → reject
    if (!session.email) {
      const [existingGuest] = await db
        .select({ id: guests.id })
        .from(guests)
        .where(eq(guests.email, rsvpEmail))
        .limit(1)
      if (existingGuest) {
        throw createError(409, 'EMAIL_CLAIMED', 'This email is already in our system. Use the browser where you previously responded, or log in if you have an account.')
      }
    }

    // Email blocklist check
    const [blockedEmail] = await db
      .select({ id: emailBlocklist.id })
      .from(emailBlocklist)
      .where(eq(emailBlocklist.email, rsvpEmail))
      .limit(1)
    if (blockedEmail) throw createError(403, 'EMAIL_BLOCKED', 'This email address has been blocked.')

    // Invite-only events require an attendee token to have been claimed in this session
    if (event.eventType === 'invite_only') {
      const access = session.eventAccess?.[slug]
      if (access !== 'attendee' && access !== 'editor') {
        throw createError(403, 'TOKEN_REQUIRED', 'An invite link is required to RSVP to this event.')
      }
    }

    let rsvpStatus: string = body.status
    if (body.status === 'yes' && event.maxCapacity) {
      const [countRow] = await db
        .select({ yesCount: count() })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'yes')))
      const yesCount = Number(countRow?.yesCount ?? 0)
      if (yesCount >= event.maxCapacity) {
        rsvpStatus = 'waitlist'
      }
    }

    // Identity lock: once a session has a display name, use that instead of what was submitted
    const lockedName = session.displayName ?? body.displayName

    // Persist display name and email on first RSVP
    if (!session.displayName) {
      await db
        .update(visitorSessions)
        .set({ displayName: lockedName, email: rsvpEmail })
        .where(eq(visitorSessions.id, session.id))
      session.displayName = lockedName
    }

    // Find-or-create guest by email
    const [guest] = await db.insert(guests)
      .values({
        name:   lockedName,
        email:  rsvpEmail,
        userId: session.userId ?? null,
      })
      .onConflictDoUpdate({
        target: guests.email,
        set: {
          name:      lockedName,
          userId:    session.userId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: guests.id })
    if (!guest) throw createError(500, 'INTERNAL_ERROR', 'Failed to upsert guest.')

    // Select-then-upsert: find existing RSVP for this session/user first
    const [existingRsvp] = await db
      .select({ id: rsvps.id, sessionId: rsvps.sessionId })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.sessionId, session.id)))
      .limit(1)

    let rsvp
    if (existingRsvp) {
      const updated = await db.update(rsvps)
        .set({
          displayName: lockedName,
          email:       rsvpEmail,
          status:      rsvpStatus,
          headCount:   body.headCount,
          note:        body.note ?? null,
          guestId:     guest.id,
          updatedAt:   new Date(),
        })
        .where(eq(rsvps.id, existingRsvp.id))
        .returning()
      rsvp = updated[0]
    } else {
      const inserted = await db.insert(rsvps)
        .values({
          eventId:     event.id,
          sessionId:   session.id,
          userId:      session.userId ?? null,
          guestId:     guest.id,
          displayName: lockedName,
          email:       rsvpEmail,
          status:      rsvpStatus,
          headCount:   body.headCount,
          note:        body.note ?? null,
        })
        .returning()
      rsvp = inserted[0]
    }
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

    return reply.code(201).send({ rsvp: serializeRsvp(rsvp) })
  })

  fastify.patch('/api/events/:slug/rsvps/:rsvpId', async (request) => {
    const { slug, rsvpId } = request.params as { slug: string; rsvpId: string }
    const body = UpdateRsvpSchema.parse(request.body)

    const rows = await db
      .select({ id: rsvps.id, sessionId: rsvps.sessionId, userId: rsvps.userId, guestId: rsvps.guestId, status: rsvps.status, eventId: rsvps.eventId })
      .from(rsvps)
      .where(eq(rsvps.id, rsvpId))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'RSVP_NOT_FOUND', 'RSVP not found.')

    const isGuestOwner = request.user?.type === 'guest' && existing.guestId === request.user.sub

    const canEdit = request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub) ||
      isGuestOwner

    if (!canEdit) throw createError(403, 'FORBIDDEN', 'Cannot modify this RSVP.')

    const updates: Partial<typeof rsvps.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() }

    let finalStatus: string | undefined = body.status

    if (body.status === 'yes' && existing.status !== 'yes') {
      const [eventRow] = await db
        .select({ maxCapacity: events.maxCapacity })
        .from(events)
        .where(eq(events.id, existing.eventId))
        .limit(1)

      if (eventRow?.maxCapacity) {
        const [countRow] = await db
          .select({ yesCount: count() })
          .from(rsvps)
          .where(and(eq(rsvps.eventId, existing.eventId), eq(rsvps.status, 'yes')))

        if (Number(countRow?.yesCount ?? 0) >= eventRow.maxCapacity) {
          finalStatus = 'waitlist'
        }
      }
    }

    if (finalStatus !== undefined) updates.status = finalStatus
    if (body.headCount !== undefined) updates.headCount = body.headCount
    if (body.note !== undefined) updates.note = body.note ?? null

    const updated = await db.update(rsvps).set(updates).where(eq(rsvps.id, rsvpId)).returning()
    const rsvp = updated[0]
    if (!rsvp) throw createError(404, 'RSVP_NOT_FOUND', 'RSVP not found.')

    if (existing.status === 'yes' && finalStatus && finalStatus !== 'yes') {
      await promoteFromWaitlist(existing.eventId, slug)
    }

    return { rsvp: serializeRsvp(rsvp) }
  })

  fastify.delete('/api/events/:slug/rsvps/:rsvpId', async (request, reply) => {
    const { slug, rsvpId } = request.params as { slug: string; rsvpId: string }

    const rows = await db
      .select({ id: rsvps.id, sessionId: rsvps.sessionId, userId: rsvps.userId, guestId: rsvps.guestId, status: rsvps.status, eventId: rsvps.eventId })
      .from(rsvps)
      .where(eq(rsvps.id, rsvpId))
      .limit(1)

    const existing = rows[0]
    if (!existing) throw createError(404, 'RSVP_NOT_FOUND', 'RSVP not found.')

    const isGuestOwner = request.user?.type === 'guest' && existing.guestId === request.user.sub

    const canDelete = request.isEditor ||
      (request.session && existing.sessionId === request.session.id) ||
      (request.user && existing.userId === request.user.sub) ||
      isGuestOwner

    if (!canDelete) throw createError(403, 'FORBIDDEN', 'Cannot delete this RSVP.')

    await db.delete(rsvps).where(eq(rsvps.id, rsvpId))

    if (existing.status === 'yes') {
      await promoteFromWaitlist(existing.eventId, slug)
    }

    return reply.code(204).send()
  })

  fastify.get('/api/events/:slug/rsvps', async (request) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db
      .select({ id: events.id, showGuests: events.showGuests, organizerId: events.organizerId })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const isEditor = request.isEditor ||
      (request.user?.type === 'operator' && (request.user.role === 'admin' || request.user.role === 'organizer'))

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
        userId:      rsvps.userId,
        guestId:     rsvps.guestId,
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
        guestId:     r.guestId,
        createdAt:   r.createdAt.toISOString(),
        isHost:      r.userId !== null && r.userId === event.organizerId,
        ...(isEditor ? { email: r.email } : {}),
      })),
    }
  })
}

async function promoteFromWaitlist(eventId: string, eventSlug: string) {
  const [eventRow] = await db
    .select({ maxCapacity: events.maxCapacity })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRow?.maxCapacity) return

  const [countRow] = await db
    .select({ yesCount: count() })
    .from(rsvps)
    .where(and(eq(rsvps.eventId, eventId), eq(rsvps.status, 'yes')))

  const yesCount = Number(countRow?.yesCount ?? 0)
  if (yesCount >= eventRow.maxCapacity) return

  const [waitlisted] = await db
    .select({ id: rsvps.id, sessionId: rsvps.sessionId, userId: rsvps.userId })
    .from(rsvps)
    .where(and(eq(rsvps.eventId, eventId), eq(rsvps.status, 'waitlist')))
    .orderBy(asc(rsvps.createdAt))
    .limit(1)

  if (!waitlisted) return

  await db.update(rsvps)
    .set({ status: 'yes', updatedAt: new Date() })
    .where(eq(rsvps.id, waitlisted.id))

  await db.insert(notifications).values({
    sessionId: waitlisted.sessionId ?? null,
    userId:    waitlisted.userId ?? null,
    eventId:   eventId,
    type:      'waitlist_promotion',
    body:      "A spot opened up — you've been moved from the waitlist to confirmed!",
    link:      `/event/${eventSlug}`,
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
