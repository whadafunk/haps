import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { visitorSessions, events, rsvps, emailBlocklist } from '../db/schema.js'
import { eq, and, inArray, or } from 'drizzle-orm'
import { UpdateSessionSchema, SubmitProfileSchema } from '@haps/shared'
import { createError } from '../lib/errors.js'

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/session/me', async (request, reply) => {
    if (!request.session) {
      return reply.send({ session: null, events: [] })
    }
    const session = request.session

    // Self-heal: if user is logged in but session hasn't been linked yet, link now
    if (request.user?.type === 'operator' && !session.userId) {
      session.userId = request.user.sub
      db.update(visitorSessions)
        .set({ userId: request.user.sub })
        .where(eq(visitorSessions.id, session.id))
        .execute()
        .catch(() => {})
    } else if (request.user?.type === 'guest' && !session.guestId) {
      session.guestId = request.user.sub
      db.update(visitorSessions)
        .set({ guestId: request.user.sub })
        .where(eq(visitorSessions.id, session.id))
        .execute()
        .catch(() => {})
    }

    const accessSlugs = Object.keys(session.eventAccess)

    // For organizer/admin accounts, also include events they created
    let organizerEventRows: Array<{ id: string; slug: string; title: string; startsAt: Date }> = []
    if (session.userId) {
      organizerEventRows = await db
        .select({ id: events.id, slug: events.slug, title: events.title, startsAt: events.startsAt })
        .from(events)
        .where(eq(events.organizerId, session.userId))
    }

    const organizerSlugs = organizerEventRows.map((e) => e.slug)
    const accessOnlySlugs = accessSlugs.filter((s) => !organizerSlugs.includes(s))

    // Fetch events from event_access that aren't already in organizer events
    const accessOnlyRows = accessOnlySlugs.length > 0
      ? await db
          .select({ id: events.id, slug: events.slug, title: events.title, startsAt: events.startsAt })
          .from(events)
          .where(inArray(events.slug, accessOnlySlugs))
      : []

    const allEventRows = [...organizerEventRows, ...accessOnlyRows]

    let eventList: Array<{
      slug: string
      title: string
      startsAt: string
      myStatus: string | null
      isEditor: boolean
    }> = []

    if (allEventRows.length > 0) {
      const allEventIds = allEventRows.map((e) => e.id)

      const rsvpFilter = session.userId
        ? or(eq(rsvps.sessionId, session.id), eq(rsvps.userId, session.userId))
        : eq(rsvps.sessionId, session.id)

      const rsvpRows = await db
        .select({ eventId: rsvps.eventId, status: rsvps.status })
        .from(rsvps)
        .where(and(rsvpFilter, inArray(rsvps.eventId, allEventIds)))

      const rsvpByEventId = Object.fromEntries(rsvpRows.map((r) => [r.eventId, r.status]))

      eventList = allEventRows.map((e) => ({
        slug: e.slug,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        myStatus: rsvpByEventId[e.id] ?? null,
        isEditor: organizerSlugs.includes(e.slug) || session.eventAccess[e.slug] === 'editor',
      }))
    }

    return {
      session: { displayName: session.displayName, email: session.email, guestId: session.guestId ?? null },
      events: eventList,
    }
  })

  fastify.patch('/api/session/me', async (request, reply) => {
    if (!request.session) throw createError(404, 'SESSION_NOT_FOUND', 'No active session.')
    const session = request.session

    const body = UpdateSessionSchema.parse(request.body)
    const updates: Partial<typeof visitorSessions.$inferInsert> = {}
    if (body.displayName !== undefined) updates.displayName = body.displayName
    if (body.email !== undefined) updates.email = body.email

    await db.update(visitorSessions).set(updates).where(eq(visitorSessions.id, session.id))

    return { session: { displayName: body.displayName ?? session.displayName, email: body.email ?? session.email } }
  })

  // Clear the visitor session cookie — anonymous guests only (logged-in users use /auth/logout)
  fastify.post('/api/session/clear', async (request, reply) => {
    reply.clearCookie('vsid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
    })
    return reply.code(204).send()
  })

  // Profile gate: guest submits required details before their first RSVP
  fastify.post('/api/session/profile', async (request, reply) => {
    if (!request.session) throw createError(404, 'SESSION_NOT_FOUND', 'No active session.')
    const session = request.session

    const body = SubmitProfileSchema.parse(request.body)

    // Check email blocklist
    const [blocked] = await db
      .select({ id: emailBlocklist.id })
      .from(emailBlocklist)
      .where(eq(emailBlocklist.email, body.email.toLowerCase()))
      .limit(1)
    if (blocked) throw createError(403, 'EMAIL_BLOCKED', 'This email address has been blocked.')

    await db.update(visitorSessions).set({
      displayName:     body.displayName,
      email:           body.email.toLowerCase(),
      phone:           body.phone ?? null,
      instagramHandle: body.instagramHandle ?? null,
    }).where(eq(visitorSessions.id, session.id))

    return { ok: true }
  })
}

export default sessionRoutes
