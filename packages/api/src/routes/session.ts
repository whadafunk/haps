import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { visitorSessions, events, rsvps } from '../db/schema.js'
import { eq, and, inArray, or } from 'drizzle-orm'
import { UpdateSessionSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/session/me', async (request, reply) => {
    await ensureSession(request, reply)
    const session = request.session!

    // Self-heal: if user is logged in but session hasn't been linked yet, link now
    if (request.user && !session.userId) {
      session.userId = request.user.sub
      db.update(visitorSessions)
        .set({ userId: request.user.sub })
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
      session: { displayName: session.displayName, email: session.email },
      events: eventList,
    }
  })

  fastify.patch('/api/session/me', async (request, reply) => {
    await ensureSession(request, reply)
    const session = request.session!

    const body = UpdateSessionSchema.parse(request.body)
    const updates: Partial<typeof visitorSessions.$inferInsert> = {}
    if (body.displayName !== undefined) updates.displayName = body.displayName
    if (body.email !== undefined) updates.email = body.email

    await db.update(visitorSessions).set(updates).where(eq(visitorSessions.id, session.id))

    return { session: { displayName: body.displayName ?? session.displayName, email: body.email ?? session.email } }
  })
}

export default sessionRoutes
