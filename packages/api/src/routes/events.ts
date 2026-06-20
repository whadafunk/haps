import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events, eventTokens, rsvps, visitorSessions, guests, users, albumPhotos, notifications } from '../db/schema.js'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { generateToken, hashToken, verifyToken } from '../lib/crypto.js'
import { generateSlug } from '../lib/slug.js'
import { createError } from '../lib/errors.js'
import { CreateEventSchema, UpdateEventSchema, CreateTokenSchema, InviteContactsSchema } from '@haps/shared'
import { ensureSession } from '../middleware/session.js'
import { config } from '../lib/config.js'
import { nanoid } from 'nanoid'
import { detectMimeType, getAllowedExtension, saveLocalFile, deleteLocalFile } from '../services/storage.js'
import { sendEmail } from '../services/email.js'
import { sendPushToSession } from '../services/push.js'

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/events', {
    preHandler: [fastify.requireRole('organizer')],
  }, async (request, reply) => {
    const body = CreateEventSchema.parse(request.body)
    const slug = generateSlug()
    const rawEditToken = generateToken()
    const editTokenHash = await hashToken(rawEditToken)
    const rawInviteToken = generateToken()
    const inviteTokenHash = await hashToken(rawInviteToken)

    const [event] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(events).values({
        slug,
        organizerId: request.user!.sub,
        title: body.title,
        description: body.description ?? null,
        location: body.location ?? null,
        coordinates: body.coordinates ?? null,
        dressCode: body.dressCode ?? null,
        allowPlusOnes: body.allowPlusOnes ?? false,
        maxPlusOnes: body.maxPlusOnes ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        timezone: body.timezone,
        theme: body.theme ?? null,
        eventType: body.eventType,
        showGuests: body.showGuests,
        allowComments: body.allowComments,
        showAlbum: body.showAlbum ?? true,
        maxCapacity: body.maxCapacity ?? null,
        rsvpDeadline: body.rsvpDeadline ? new Date(body.rsvpDeadline) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      }).returning()

      const evt = inserted[0]
      if (!evt) throw new Error('Insert failed')

      const tokenValues: (typeof eventTokens.$inferInsert)[] = [
        { eventId: evt.id, type: 'edit', tokenHash: editTokenHash, label: 'host' },
      ]
      // Open events get a general reusable invite token; invite-only events use per-person tokens
      if (body.eventType !== 'invite_only') {
        const generalInviteUrl = `${config.APP_URL}/event/${slug}?t=${rawInviteToken}`
        tokenValues.push({ eventId: evt.id, type: 'attendee', tokenHash: inviteTokenHash, label: 'general', singleUse: false, inviteUrl: generalInviteUrl })
      }
      await tx.insert(eventTokens).values(tokenValues)

      return inserted
    })

    if (!event) throw createError(500, 'INTERNAL_ERROR', 'Failed to create event.')

    const editLink = `${config.APP_URL}/event/${slug}/edit/${rawEditToken}`
    const inviteLink = body.eventType !== 'invite_only' ? `${config.APP_URL}/event/${slug}?t=${rawInviteToken}` : null
    fastify.log.info({ slug }, 'event created')
    return reply.code(201).send({ event: serializeEvent(event), editLink, editToken: rawEditToken, inviteLink, inviteToken: body.eventType !== 'invite_only' ? rawInviteToken : null })
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
    let inviteAlreadyUsed = false
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
              fastify.log.info({ tokenId: tokenRow.id, sessionId }, 'single-use invite token already claimed by different session')
              inviteAlreadyUsed = true
              break
            }
          }

          // For single-use tokens, store a pending claim in the session rather than
          // claiming immediately — prevents link-preview bots from consuming the token
          // before the real user arrives. The claim is finalised atomically on RSVP.
          const accessValue = tokenRow.singleUse && tokenRow.claimedBySessionId === null
            ? { role: 'attendee' as const, tokenId: tokenRow.id }
            : 'attendee' as const

          const updatedAccess = {
            ...request.session!.eventAccess,
            [slug]: accessValue,
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

    const [countRows, organizerRows] = await Promise.all([
      db
        .select({
          guestCount: sql<number>`coalesce(sum(${rsvps.headCount}), 0)`,
          yesCount: sql<number>`coalesce(sum(${rsvps.headCount}) filter (where ${rsvps.status} = 'yes'), 0)`,
          maybeCount: sql<number>`coalesce(sum(${rsvps.headCount}) filter (where ${rsvps.status} = 'maybe'), 0)`,
          waitlistCount: sql<number>`count(*) filter (where ${rsvps.status} = 'waitlist')`,
        })
        .from(rsvps)
        .leftJoin(visitorSessions, eq(rsvps.sessionId, visitorSessions.id))
        .where(and(
          eq(rsvps.eventId, event.id),
          // exclude blocked/removed session-based RSVPs from counts
          sql`(${rsvps.sessionId} is null or coalesce(${visitorSessions.status}, 'active') = 'active')`,
        )),
      db.select({ displayName: users.displayName }).from(users).where(eq(users.id, event.organizerId)).limit(1),
    ])

    const counts = countRows[0]
    const organizerName = organizerRows[0]?.displayName ?? null

    let myRsvp = null
    if (request.session) {
      // After guest login, mergeSessionIntoGuest clears sessionId and sets guestId on the RSVP.
      // Look up by guestId when present, otherwise by sessionId.
      const rsvpWhere = request.session.guestId
        ? and(eq(rsvps.eventId, event.id), eq(rsvps.guestId, request.session.guestId))
        : and(eq(rsvps.eventId, event.id), eq(rsvps.sessionId, request.session.id))
      const myRows = await db
        .select({ status: rsvps.status, headCount: rsvps.headCount, note: rsvps.note, displayName: rsvps.displayName })
        .from(rsvps)
        .where(rsvpWhere)
        .limit(1)
      myRsvp = myRows[0] ?? null
    }

    const sessionBlocked = request.session?.status === 'blocked' || request.session?.status === 'removed'
    const sessionProfileRequired = !!(request.session && !request.session.email && !request.session.userId)

    const showCounts = event.showGuests || !!isEditor
    return {
      event: {
        ...serializeEvent(event),
        organizerName,
        guestCount: showCounts ? Number(counts?.guestCount ?? 0) : 0,
        yesCount: showCounts ? Number(counts?.yesCount ?? 0) : 0,
        maybeCount: showCounts ? Number(counts?.maybeCount ?? 0) : 0,
        waitlistCount: showCounts ? Number(counts?.waitlistCount ?? 0) : 0,
      },
      myRsvp,
      isEditor: isEditor ?? false,
      sessionProfileRequired: !sessionBlocked && sessionProfileRequired,
      sessionBlocked,
      sessionBlockReason: sessionBlocked ? (request.session?.statusReason ?? null) : null,
      inviteAlreadyUsed,
    }
  })

  fastify.patch('/api/events/:slug', {
    preHandler: [fastify.requireEditToken],
  }, async (request) => {
    const { slug } = request.params as { slug: string }
    const body = UpdateEventSchema.parse(request.body)

    // Fetch current state before update to detect meaningful changes
    const [current] = await db
      .select({ id: events.id, status: events.status, startsAt: events.startsAt, title: events.title })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!current) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.title !== undefined) updates['title'] = body.title
    if (body.description !== undefined) updates['description'] = body.description ?? null
    if (body.location !== undefined) updates['location'] = body.location ?? null
    if (body.coordinates !== undefined) updates['coordinates'] = body.coordinates ?? null
    if (body.dressCode !== undefined) updates['dressCode'] = body.dressCode ?? null
    if (body.allowPlusOnes !== undefined) updates['allowPlusOnes'] = body.allowPlusOnes
    if (body.maxPlusOnes !== undefined) updates['maxPlusOnes'] = body.maxPlusOnes ?? null
    if (body.startsAt !== undefined) {
      if (new Date(body.startsAt) <= new Date()) throw createError(400, 'INVALID_DATE', 'Event start date must be in the future.')
      updates['startsAt'] = new Date(body.startsAt)
    }
    if (body.endsAt !== undefined) updates['endsAt'] = body.endsAt ? new Date(body.endsAt) : null
    if (body.timezone !== undefined) updates['timezone'] = body.timezone
    if (body.theme !== undefined) updates['theme'] = body.theme ?? null
    if (body.status !== undefined) updates['status'] = body.status
    if (body.showGuests !== undefined) updates['showGuests'] = body.showGuests
    if (body.allowComments !== undefined) updates['allowComments'] = body.allowComments
    if (body.showAlbum !== undefined) updates['showAlbum'] = body.showAlbum
    if (body.maxCapacity !== undefined) updates['maxCapacity'] = body.maxCapacity ?? null
    if (body.rsvpDeadline !== undefined) updates['rsvpDeadline'] = body.rsvpDeadline ? new Date(body.rsvpDeadline) : null
    if (body.expiresAt !== undefined) updates['expiresAt'] = body.expiresAt ? new Date(body.expiresAt) : null
    if (body.welcomeMessage !== undefined) updates['welcomeMessage'] = body.welcomeMessage ?? null

    const updated = await db.update(events).set(updates as Parameters<ReturnType<typeof db.update>['set']>[0]).where(eq(events.slug, slug)).returning()
    const event = updated[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const wasCancelled = body.status === 'cancelled' && current.status !== 'cancelled'
    const wasRescheduled = body.startsAt !== undefined &&
      new Date(body.startsAt).getTime() !== current.startsAt.getTime() &&
      current.status === 'published'

    if (wasCancelled || wasRescheduled) {
      const eventRsvps = await db
        .select({ sessionId: rsvps.sessionId, userId: rsvps.userId })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, current.id), inArray(rsvps.status, ['yes', 'maybe', 'waitlist'])))

      if (eventRsvps.length > 0) {
        const eventTitle = (updates['title'] as string | undefined) ?? current.title
        const notifType = wasCancelled ? 'event_cancelled' : 'event_rescheduled'
        const notifBody = wasCancelled
          ? `${eventTitle} has been cancelled.`
          : `${eventTitle} has been rescheduled to ${new Date(body.startsAt!).toLocaleDateString()}.`

        await db.insert(notifications).values(
          eventRsvps.map(r => ({
            sessionId: r.sessionId ?? null,
            userId:    r.userId ?? null,
            eventId:   current.id,
            type:      notifType,
            body:      notifBody,
            link:      `/event/${slug}`,
          }))
        )
        for (const r of eventRsvps) {
          if (r.sessionId) {
            void sendPushToSession(r.sessionId, null, { title: eventTitle, body: notifBody, link: `/event/${slug}` })
          }
        }
      }
    }

    return { event: serializeEvent(event) }
  })

  fastify.delete('/api/events/:slug', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const [event] = await db
      .select({ id: events.id, coverImageUrl: events.coverImageUrl })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!event) return reply.code(204).send()

    const photos = await db
      .select({ url: albumPhotos.url })
      .from(albumPhotos)
      .where(eq(albumPhotos.eventId, event.id))

    await db.delete(events).where(eq(events.id, event.id))

    const fileUrls = photos.map(p => p.url)
    if (event.coverImageUrl) fileUrls.push(event.coverImageUrl)
    await Promise.all(fileUrls.map(deleteLocalFile))

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
      .select({ id: eventTokens.id, type: eventTokens.type, label: eventTokens.label, status: eventTokens.status, singleUse: eventTokens.singleUse, inviteUrl: eventTokens.inviteUrl, claimedBySessionId: eventTokens.claimedBySessionId, createdAt: eventTokens.createdAt })
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
    const inviteUrl = `${config.APP_URL}/event/${slug}?t=${rawToken}`
    const inserted = await db.insert(eventTokens).values({
      eventId: event.id,
      type: 'attendee',
      tokenHash,
      label: body.label ?? null,
      singleUse: body.singleUse ?? false,
      inviteUrl,
    }).returning({ id: eventTokens.id, type: eventTokens.type, label: eventTokens.label, singleUse: eventTokens.singleUse, inviteUrl: eventTokens.inviteUrl })

    const token = inserted[0]
    if (!token) throw createError(500, 'INTERNAL_ERROR', 'Failed to create token.')

    return reply.code(201).send({ token })
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

  // Directory — guests not yet invited to this event
  fastify.get('/api/events/:slug/directory', {
    preHandler: [fastify.requireEditToken],
  }, async (request) => {
    const { slug } = request.params as { slug: string }

    const eventRows = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1)
    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const guestList = await db
      .select({
        id: guests.id,
        name: guests.name,
        email: guests.email,
        phone: guests.phone,
        instagramHandle: guests.instagramHandle,
      })
      .from(guests)
      .where(sql`not exists (
        select 1 from event_tokens
        where event_tokens.event_id = ${event.id}
          and event_tokens.type = 'attendee'
          and event_tokens.status = 'active'
          and event_tokens.guest_id = guests.id
      )`)
      .orderBy(guests.name)

    return { contacts: guestList }
  })

  // Invite contacts from the directory to this event
  fastify.post('/api/events/:slug/invitations', {
    preHandler: [fastify.requireEditToken],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = InviteContactsSchema.parse(request.body)

    const eventRows = await db
      .select({ id: events.id, title: events.title, eventType: events.eventType })
      .from(events).where(eq(events.slug, slug)).limit(1)
    const event = eventRows[0]
    if (!event) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    const invitations: Array<{ guestId: string; guestName: string; tokenId: string | null; inviteLink: string | null; emailSent: boolean; whatsappUrl: string | null }> = []

    if (event.eventType === 'open') {
      // Open events: notify only — share the plain event URL, no token generated
      const eventUrl = `${config.APP_URL}/event/${slug}`
      for (const guestId of body.contactIds) {
        const guestRows = await db
          .select({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone })
          .from(guests).where(eq(guests.id, guestId)).limit(1)
        const guest = guestRows[0]
        if (!guest) continue

        let emailSent = false
        if (body.channels.includes('email') && guest.email) {
          try {
            await sendEmail({
              to: guest.email,
              subject: `You're invited to ${event.title}`,
              text: `Hi ${guest.name},\n\nYou've been invited to ${event.title}.\n\nView the event and RSVP here:\n${eventUrl}`,
              html: `<p>Hi ${guest.name},</p><p>You've been invited to <strong>${event.title}</strong>.</p><p><a href="${eventUrl}">View event and RSVP →</a></p>`,
            })
            emailSent = true
          } catch { /* SMTP not configured or failed — degrade gracefully */ }
        }

        const whatsappUrl = (body.channels.includes('whatsapp') && guest.phone)
          ? `https://wa.me/${guest.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${guest.name}! You're invited to ${event.title}. RSVP here: ${eventUrl}`)}`
          : null

        invitations.push({ guestId: guest.id, guestName: guest.name, tokenId: null, inviteLink: null, emailSent, whatsappUrl })
      }
    } else {
      // Invite-only events: create a single-use token per guest
      for (const guestId of body.contactIds) {
        const guestRows = await db
          .select({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone })
          .from(guests)
          .where(eq(guests.id, guestId))
          .limit(1)
        const guest = guestRows[0]
        if (!guest) continue

        // Idempotent — skip if this guest already has an active token for this event
        const existing = await db
          .select({ id: eventTokens.id })
          .from(eventTokens)
          .where(and(
            eq(eventTokens.eventId, event.id),
            eq(eventTokens.type, 'attendee'),
            eq(eventTokens.status, 'active'),
            eq(eventTokens.guestId, guestId),
          ))
          .limit(1)
        if (existing[0]) continue

        const rawToken = generateToken()
        const tokenHash = await hashToken(rawToken)

        const inviteLink = `${config.APP_URL}/event/${slug}?t=${rawToken}`

        const [inserted] = await db.insert(eventTokens).values({
          eventId: event.id,
          type: 'attendee',
          label: guest.name,
          tokenHash,
          singleUse: true,
          guestId: guest.id,
          inviteUrl: inviteLink,
        }).returning({ id: eventTokens.id })

        if (!inserted) continue

        let emailSent = false
        if (body.channels.includes('email') && guest.email) {
          try {
            await sendEmail({
              to: guest.email,
              subject: `You're invited to ${event.title}`,
              text: `Hi ${guest.name},\n\nYou've been invited to ${event.title}.\n\nView the event and RSVP here:\n${inviteLink}`,
              html: `<p>Hi ${guest.name},</p><p>You've been invited to <strong>${event.title}</strong>.</p><p><a href="${inviteLink}">View event and RSVP →</a></p>`,
            })
            emailSent = true
          } catch { /* SMTP not configured or failed — degrade gracefully */ }
        }

        const whatsappUrl = (body.channels.includes('whatsapp') && guest.phone)
          ? `https://wa.me/${guest.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${guest.name}! You're invited to ${event.title}. Here's your personal invite link: ${inviteLink}`)}`
          : null

        invitations.push({ guestId: guest.id, guestName: guest.name, tokenId: inserted.id, inviteLink, emailSent, whatsappUrl })
      }
    }

    return reply.code(200).send({ invitations })
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
    coordinates: event.coordinates,
    dressCode: event.dressCode,
    allowPlusOnes: event.allowPlusOnes,
    maxPlusOnes: event.maxPlusOnes,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    timezone: event.timezone,
    coverImageUrl: event.coverImageUrl,
    theme: event.theme,
    status: event.status,
    showGuests: event.showGuests,
    allowComments: event.allowComments,
    showAlbum: event.showAlbum,
    eventType: event.eventType as 'open' | 'invite_only',
    maxCapacity: event.maxCapacity,
    rsvpDeadline: event.rsvpDeadline?.toISOString() ?? null,
    expiresAt: event.expiresAt?.toISOString() ?? null,
    welcomeMessage: event.welcomeMessage ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }
}

export default eventsRoutes
