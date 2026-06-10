import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, eventTokens, rsvps, visitorSessions } from '../db/schema.js'
import { eq, and, count, sql } from 'drizzle-orm'
import { generateToken, hashToken, verifyToken } from '../lib/crypto.js'
import { generateSlug } from '../lib/slug.js'
import { createError } from '../lib/errors.js'
import { CreateEventSchema, UpdateEventSchema, CreateTokenSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'
import { config } from '../lib/config.js'
import { nanoid } from 'nanoid'
import { detectMimeType, getAllowedExtension, saveLocalFile } from '../services/storage.js'

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/events', {
    preHandler: [fastify.requireRole('organizer')],
  }, async (request, reply) => {
    const body = CreateEventSchema.parse(request.body)
    const slug = generateSlug()
    const rawToken = generateToken()
    const tokenHash = await hashToken(rawToken)

    const [event] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(events).values({
        slug,
        organizerId: request.user!.sub,
        title: body.title,
        description: body.description ?? null,
        location: body.location ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        timezone: body.timezone,
        theme: body.theme ?? null,
        showGuests: body.showGuests,
        allowComments: body.allowComments,
        maxCapacity: body.maxCapacity ?? null,
        rsvpDeadline: body.rsvpDeadline ? new Date(body.rsvpDeadline) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      }).returning()

      const evt = inserted[0]
      if (!evt) throw new Error('Insert failed')

      await tx.insert(eventTokens).values({
        eventId: evt.id,
        type: 'edit',
        tokenHash,
        label: 'host',
      })

      return inserted
    })

    if (!event) throw createError(500, 'INTERNAL_ERROR', 'Failed to create event.')

    const editLink = `${config.APP_URL}/event/${slug}/edit/${rawToken}`
    return reply.code(201).send({ event: serializeEvent(event), editLink, editToken: rawToken })
  })

  fastify.get('/api/events/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    const event = rows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const isEditor = request.session?.eventAccess?.[slug] === 'editor' ||
      request.user?.role === 'admin' || request.user?.role === 'organizer'

    if ((event.status === 'draft' || event.status === 'archived') && !isEditor) {
      throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')
    }

    // Validate attendee token from query string.
    // Only create a session if the token is valid — this is the intended session-creation trigger.
    const queryT = (request.query as Record<string, string | undefined>)['t']
    if (queryT && !isEditor) {
      const tokenRows = await db
        .select({ id: eventTokens.id, tokenHash: eventTokens.tokenHash, singleUse: eventTokens.singleUse, claimedBySessionId: eventTokens.claimedBySessionId })
        .from(eventTokens)
        .where(and(eq(eventTokens.eventId, event.id), eq(eventTokens.type, 'attendee'), eq(eventTokens.status, 'active')))

      for (const tokenRow of tokenRows) {
        const valid = await verifyToken(tokenRow.tokenHash, queryT)
        if (valid) {
          await ensureSession(request, reply)
          const sessionId = request.session!.id

          if (tokenRow.singleUse) {
            if (tokenRow.claimedBySessionId !== null && tokenRow.claimedBySessionId !== sessionId) {
              // Token already used by a different session — don't grant access
              break
            }
            if (tokenRow.claimedBySessionId === null) {
              await db.update(eventTokens).set({ claimedBySessionId: sessionId }).where(eq(eventTokens.id, tokenRow.id))
            }
          }

          const updatedAccess: Record<string, 'attendee' | 'editor'> = {
            ...request.session!.eventAccess,
            [slug]: 'attendee',
          }
          request.session!.eventAccess = updatedAccess
          await db
            .update(visitorSessions)
            .set({ eventAccess: updatedAccess })
            .where(eq(visitorSessions.id, sessionId))
          break
        }
      }
    }

    const countRows = await db
      .select({
        guestCount: count(),
        yesCount: sql<number>`count(*) filter (where ${rsvps.status} = 'yes')`,
        maybeCount: sql<number>`count(*) filter (where ${rsvps.status} = 'maybe')`,
      })
      .from(rsvps)
      .leftJoin(visitorSessions, eq(rsvps.sessionId, visitorSessions.id))
      .where(and(
        eq(rsvps.eventId, event.id),
        // exclude blocked/removed session-based RSVPs from counts
        sql`(${rsvps.sessionId} is null or coalesce(${visitorSessions.status}, 'active') = 'active')`,
      ))

    const counts = countRows[0]

    let myRsvp = null
    if (request.session) {
      const myRows = await db
        .select({ status: rsvps.status, headCount: rsvps.headCount, note: rsvps.note })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.sessionId, request.session.id)))
        .limit(1)
      myRsvp = myRows[0] ?? null
    }

    const sessionBlocked = request.session?.status === 'blocked' || request.session?.status === 'removed'
    const sessionProfileRequired = !!(request.session && !request.session.email && !request.session.userId)

    return {
      event: {
        ...serializeEvent(event),
        guestCount: Number(counts?.guestCount ?? 0),
        yesCount: Number(counts?.yesCount ?? 0),
        maybeCount: Number(counts?.maybeCount ?? 0),
      },
      myRsvp,
      isEditor: isEditor ?? false,
      sessionProfileRequired: !sessionBlocked && sessionProfileRequired,
      sessionBlocked,
      sessionBlockReason: sessionBlocked ? (request.session?.statusReason ?? null) : null,
    }
  })

  fastify.patch('/api/events/:slug', {
    preHandler: [fastify.requireEditToken],
  }, async (request) => {
    const { slug } = request.params as { slug: string }
    const body = UpdateEventSchema.parse(request.body)

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.title !== undefined) updates['title'] = body.title
    if (body.description !== undefined) updates['description'] = body.description ?? null
    if (body.location !== undefined) updates['location'] = body.location ?? null
    if (body.startsAt !== undefined) updates['startsAt'] = new Date(body.startsAt)
    if (body.endsAt !== undefined) updates['endsAt'] = body.endsAt ? new Date(body.endsAt) : null
    if (body.timezone !== undefined) updates['timezone'] = body.timezone
    if (body.theme !== undefined) updates['theme'] = body.theme ?? null
    if (body.status !== undefined) updates['status'] = body.status
    if (body.showGuests !== undefined) updates['showGuests'] = body.showGuests
    if (body.allowComments !== undefined) updates['allowComments'] = body.allowComments
    if (body.maxCapacity !== undefined) updates['maxCapacity'] = body.maxCapacity ?? null
    if (body.rsvpDeadline !== undefined) updates['rsvpDeadline'] = body.rsvpDeadline ? new Date(body.rsvpDeadline) : null
    if (body.expiresAt !== undefined) updates['expiresAt'] = body.expiresAt ? new Date(body.expiresAt) : null

    const updated = await db.update(events).set(updates as Parameters<ReturnType<typeof db.update>['set']>[0]).where(eq(events.slug, slug)).returning()
    const event = updated[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    return { event: serializeEvent(event) }
  })

  fastify.delete('/api/events/:slug', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await db.delete(events).where(eq(events.slug, slug))
    return reply.code(204).send()
  })

  fastify.get('/api/events/:slug/ics', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const rows = await db
      .select({ title: events.title, description: events.description, location: events.location, startsAt: events.startsAt, endsAt: events.endsAt, timezone: events.timezone, status: events.status })
      .from(events)
      .where(and(eq(events.slug, slug)))
      .limit(1)

    const event = rows[0]
    if (!event || event.status === 'draft') throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const endsAt = event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 60 * 60 * 1000)
    const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
    const uid = `${slug}@haps`

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Haps//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:${esc(event.title)}`,
      `DTSTART:${fmt(event.startsAt)}`,
      `DTEND:${fmt(endsAt)}`,
      event.location ? `LOCATION:${esc(event.location)}` : null,
      event.description ? `DESCRIPTION:${esc(event.description)}` : null,
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    reply.header('Content-Type', 'text/calendar; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${slug}.ics"`)
    return reply.send(ics)
  })

  // Tokens

  fastify.get('/api/events/:slug/tokens', {
    preHandler: [fastify.requireEditToken],
  }, async (request) => {
    const { slug } = request.params as { slug: string }
    const eventRows = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1)
    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const tokens = await db
      .select({ id: eventTokens.id, type: eventTokens.type, label: eventTokens.label, status: eventTokens.status, singleUse: eventTokens.singleUse, claimedBySessionId: eventTokens.claimedBySessionId, createdAt: eventTokens.createdAt })
      .from(eventTokens)
      .where(eq(eventTokens.eventId, event.id))

    return { tokens: tokens.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })) }
  })

  fastify.post('/api/events/:slug/tokens', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = CreateTokenSchema.parse(request.body)

    const eventRows = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1)
    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const rawToken = generateToken()
    const tokenHash = await hashToken(rawToken)
    const inserted = await db.insert(eventTokens).values({
      eventId: event.id,
      type: 'attendee',
      tokenHash,
      label: body.label ?? null,
      singleUse: body.singleUse ?? false,
    }).returning({ id: eventTokens.id, type: eventTokens.type, label: eventTokens.label, singleUse: eventTokens.singleUse })

    const token = inserted[0]
    if (!token) throw createError(500, 'INTERNAL_ERROR', 'Failed to create token.')

    return reply.code(201).send({ token, rawToken })
  })

  fastify.post('/api/events/:slug/cover', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const data = await request.file()
    if (!data) throw createError(400, 'NO_FILE', 'No file uploaded.')

    // Read into buffer to check magic bytes
    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
      if (Buffer.concat(chunks).length > 10 * 1024 * 1024) {
        throw createError(413, 'FILE_TOO_LARGE', 'File exceeds 10 MB limit.')
      }
    }
    const buffer = Buffer.concat(chunks)

    const mimeType = detectMimeType(buffer)
    if (!mimeType) throw createError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, and GIF images are allowed.')

    const ext = getAllowedExtension(mimeType)!
    const filename = `${nanoid()}.${ext}`

    const { Readable } = await import('stream')
    await saveLocalFile(Readable.from(buffer), filename)

    const coverImageUrl = `${config.APP_URL}/api/uploads/${filename}`
    const updated = await db
      .update(events)
      .set({ coverImageUrl, updatedAt: new Date() })
      .where(eq(events.slug, slug))
      .returning({ slug: events.slug, coverImageUrl: events.coverImageUrl })

    if (!updated[0]) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    return reply.code(200).send({ coverImageUrl })
  })

  fastify.delete('/api/events/:slug/tokens/:tokenId', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { tokenId } = request.params as { slug: string; tokenId: string }
    await db.update(eventTokens).set({ status: 'blacklisted' }).where(eq(eventTokens.id, tokenId))
    return reply.code(204).send()
  })
}

function serializeEvent(event: typeof events.$inferSelect) {
  return {
    id: event.id,
    slug: event.slug,
    organizerId: event.organizerId,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    timezone: event.timezone,
    coverImageUrl: event.coverImageUrl,
    theme: event.theme,
    status: event.status,
    showGuests: event.showGuests,
    allowComments: event.allowComments,
    maxCapacity: event.maxCapacity,
    rsvpDeadline: event.rsvpDeadline?.toISOString() ?? null,
    expiresAt: event.expiresAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }
}

export default eventsRoutes
