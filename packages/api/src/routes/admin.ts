import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, events, instanceConfig, visitorSessions, rsvps, eventTokens, emailBlocklist, guests } from '../db/schema.js'
import { eq, count, sql, and, isNull, desc, ne, inArray } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateUserSchema, BlockGuestSchema, RemoveGuestSchema, CreateGuestSchema, UpdateGuestSchema } from '@haps/shared'
import { hashPassword } from '../lib/crypto.js'
import { config } from '../lib/config.js'
import { sendEmail } from '../services/email.js'
import { z } from 'zod'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const adminPreHandler = [fastify.requireRole('admin')]
  const staffPreHandler = [fastify.requireRole('organizer')]

  fastify.get('/api/admin/events', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const query = db
      .select({ slug: events.slug, title: events.title, status: events.status, startsAt: events.startsAt, eventType: events.eventType })
      .from(events)

    const rows = user.role === 'admin'
      ? await query.orderBy(events.startsAt)
      : await query.where(eq(events.organizerId, user.sub)).orderBy(events.startsAt)

    return { events: rows.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })) }
  })

  fastify.get('/api/admin/users', { preHandler: adminPreHandler }, async () => {
    const rows = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, active: users.active, createdAt: users.createdAt })
      .from(users)
      .where(inArray(users.role, ['admin', 'organizer']))
    return { users: rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })) }
  })

  fastify.post('/api/admin/users', { preHandler: adminPreHandler }, async (request, reply) => {
    const body = CreateUserSchema.parse(request.body)
    const passwordHash = await hashPassword(body.password)

    const [user] = await db
      .insert(users)
      .values({ email: body.email, passwordHash, displayName: body.displayName, role: body.role })
      .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
      .catch(() => {
        throw createError(409, 'EMAIL_ALREADY_EXISTS', 'A user with this email already exists.')
      })

    if (!user) throw createError(500, 'INTERNAL_ERROR', 'Failed to create user.')

    // Auto-create/claim guest for the new operator user
    await db.insert(guests)
      .values({ name: body.displayName, email: body.email.toLowerCase(), userId: user.id })
      .onConflictDoUpdate({ target: guests.email, set: { userId: user.id, name: body.displayName, updatedAt: new Date() } })

    return reply.code(201).send({ user })
  })

  fastify.patch('/api/admin/users/:userId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const body = request.body as { active?: boolean }
    if (typeof body.active !== 'boolean') throw createError(400, 'BAD_REQUEST', 'active must be a boolean.')

    const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
    if (!existing) throw createError(404, 'USER_NOT_FOUND', 'User not found.')
    if (existing.role === 'admin') throw createError(403, 'FORBIDDEN', 'Cannot deactivate admin users.')

    const [updated] = await db
      .update(users)
      .set({ active: body.active, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, active: users.active })

    return reply.send({ user: updated })
  })

  fastify.delete('/api/admin/users/:userId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const [existing] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
    if (!existing) throw createError(404, 'USER_NOT_FOUND', 'User not found.')
    if (existing.role === 'admin') throw createError(403, 'FORBIDDEN', 'Cannot delete admin users.')
    await db.delete(users).where(eq(users.id, userId))
    return reply.code(204).send()
  })

  const UpdateConfigSchema = z.object({
    instanceName: z.string().min(1).max(100).optional(),
    smtpHost:     z.string().max(200).nullable().optional(),
    smtpPort:                    z.coerce.number().int().min(1).max(65535).optional(),
    smtpUser:                    z.string().max(200).nullable().optional(),
    smtpPass:                    z.string().max(200).nullable().optional(),
    smtpFrom:                    z.string().max(200).nullable().optional(),
    defaultTheme:                z.string().max(50).nullable().optional(),
    requireRsvpBeforeRegister:   z.boolean().optional(),
  }).strict()

  fastify.get('/api/admin/config', { preHandler: adminPreHandler }, async () => {
    const [row] = await db.select().from(instanceConfig).limit(1)

    return {
      config: {
        instanceName:              row?.instanceName ?? config.INSTANCE_NAME,
        smtpHost:                  row?.smtpHost ?? config.SMTP_HOST ?? null,
        smtpPort:                  row?.smtpPort ?? config.SMTP_PORT,
        smtpUser:                  row?.smtpUser ?? config.SMTP_USER ?? null,
        smtpFrom:                  row?.smtpFrom ?? config.SMTP_FROM ?? null,
        smtpConfigured:            !!(row?.smtpHost ?? config.SMTP_HOST),
        storageType:               config.STORAGE_TYPE,
        defaultTheme:              row?.defaultTheme ?? null,
        requireRsvpBeforeRegister: row?.requireRsvpBeforeRegister ?? true,
      },
    }
  })

  fastify.post('/api/admin/config/test-email', { preHandler: adminPreHandler }, async (request, reply) => {
    const to = request.user!.email
    try {
      await sendEmail({
        to,
        subject: 'Test email from Haps',
        text: 'SMTP is working correctly. You can safely use email delivery.',
      })
      return reply.code(200).send({ ok: true })
    } catch (err: any) {
      throw createError(502, 'SMTP_ERROR', err?.message ?? 'Failed to send test email.')
    }
  })

  fastify.patch('/api/admin/config', { preHandler: adminPreHandler }, async (request) => {
    const body = UpdateConfigSchema.parse(request.body)

    // Validate: host requires port, partial auth is rejected
    if (body.smtpHost && !body.smtpPort) {
      throw createError(400, 'SMTP_INCOMPLETE', 'SMTP port is required when host is set.')
    }

    // Determine effective auth state after this update
    if (body.smtpUser !== undefined || body.smtpPass !== undefined) {
      const [current] = await db.select({ smtpUser: instanceConfig.smtpUser, smtpPass: instanceConfig.smtpPass }).from(instanceConfig).limit(1)
      const effectiveUser = body.smtpUser !== undefined ? body.smtpUser : (current?.smtpUser ?? null)
      const effectivePass = body.smtpPass !== undefined ? body.smtpPass : (current?.smtpPass ?? null)
      if ((effectiveUser && !effectivePass) || (!effectiveUser && effectivePass)) {
        throw createError(400, 'SMTP_AUTH_INCOMPLETE', 'Both SMTP username and password are required when using authentication.')
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.instanceName !== undefined) updates['instanceName'] = body.instanceName
    if (body.smtpHost !== undefined) updates['smtpHost'] = body.smtpHost
    if (body.smtpPort !== undefined) updates['smtpPort'] = body.smtpPort
    if (body.smtpUser !== undefined) updates['smtpUser'] = body.smtpUser
    if (body.smtpPass !== undefined) updates['smtpPass'] = body.smtpPass
    if (body.smtpFrom !== undefined) updates['smtpFrom'] = body.smtpFrom
    if (body.defaultTheme !== undefined) updates['defaultTheme'] = body.defaultTheme
    if (body.requireRsvpBeforeRegister !== undefined) updates['requireRsvpBeforeRegister'] = body.requireRsvpBeforeRegister

    await db.insert(instanceConfig)
      .values({ id: 'singleton', ...updates })
      .onConflictDoUpdate({ target: instanceConfig.id, set: updates as Parameters<ReturnType<typeof db.update>['set']>[0] })

    const [row] = await db.select().from(instanceConfig).limit(1)
    return {
      config: {
        instanceName:              row?.instanceName ?? config.INSTANCE_NAME,
        smtpHost:                  row?.smtpHost ?? null,
        smtpPort:                  row?.smtpPort ?? config.SMTP_PORT,
        smtpUser:                  row?.smtpUser ?? null,
        smtpFrom:                  row?.smtpFrom ?? null,
        smtpConfigured:            !!(row?.smtpHost),
        storageType:               config.STORAGE_TYPE,
        defaultTheme:              row?.defaultTheme ?? null,
        requireRsvpBeforeRegister: row?.requireRsvpBeforeRegister ?? true,
      },
    }
  })

  // ── People directory ─────────────────────────────────────────────────────

  fastify.get('/api/admin/guests', { preHandler: staffPreHandler }, async () => {
    const rows = await db
      .select({
        id:          guests.id,
        type:        sql<string>`case
          when ${guests.userId} is not null and ${users.role} = 'admin' then 'admin'
          when ${guests.userId} is not null and ${users.role} = 'organizer' then 'organizer'
          when ${guests.claimedAt} is not null then 'claimed'
          else 'unclaimed'
        end`,
        displayName: guests.name,
        email:       guests.email,
        phone:       guests.phone,
        status:      guests.status,
        firstSeen:   sql<string>`coalesce((select min(r.created_at) from rsvps r where r.guest_id = ${guests.id}), ${guests.createdAt})::text`,
        eventCount:  sql<number>`(select count(distinct r.event_id)::int from rsvps r where r.guest_id = ${guests.id})`,
      })
      .from(guests)
      .leftJoin(users, eq(users.id, guests.userId))
      .orderBy(desc(guests.createdAt))

    return { guests: rows.map((g) => ({ ...g, firstSeen: new Date(g.firstSeen).toISOString() })) }
  })

  fastify.post('/api/guests', { preHandler: staffPreHandler }, async (request, reply) => {
    const body = CreateGuestSchema.parse(request.body)

    const [existing] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.email, body.email.toLowerCase()))
      .limit(1)
    if (existing) throw createError(409, 'EMAIL_ALREADY_EXISTS', 'A guest with this email already exists.')

    const [guest] = await db.insert(guests).values({
      name:            body.name,
      email:           body.email.toLowerCase(),
      phone:           body.phone ?? null,
      instagramHandle: body.instagramHandle ?? null,
      notes:           body.notes ?? null,
    }).returning({ id: guests.id, name: guests.name, email: guests.email })
    if (!guest) throw createError(500, 'INTERNAL_ERROR', 'Failed to create guest.')
    return reply.code(201).send({ contact: guest })
  })

  // Keep old route as alias
  fastify.post('/api/contacts', { preHandler: staffPreHandler }, async (request, reply) => {
    const body = CreateGuestSchema.parse(request.body)

    const [existing] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.email, body.email.toLowerCase()))
      .limit(1)
    if (existing) throw createError(409, 'EMAIL_ALREADY_EXISTS', 'A guest with this email already exists.')

    const [guest] = await db.insert(guests).values({
      name:            body.name,
      email:           body.email.toLowerCase(),
      phone:           body.phone ?? null,
      instagramHandle: body.instagramHandle ?? null,
      notes:           body.notes ?? null,
    }).returning({ id: guests.id, name: guests.name, email: guests.email })
    if (!guest) throw createError(500, 'INTERNAL_ERROR', 'Failed to create guest.')
    return reply.code(201).send({ contact: guest })
  })

  fastify.patch('/api/guests/:guestId', { preHandler: staffPreHandler }, async (request, reply) => {
    const { guestId } = request.params as { guestId: string }
    const body = UpdateGuestSchema.parse(request.body)

    const [existing] = await db.select({ id: guests.id }).from(guests).where(eq(guests.id, guestId)).limit(1)
    if (!existing) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updates.name = body.name
    if (body.email !== undefined) updates.email = body.email?.toLowerCase() ?? null
    if (body.phone !== undefined) updates.phone = body.phone ?? null
    if (body.instagramHandle !== undefined) updates.instagramHandle = body.instagramHandle ?? null
    if (body.notes !== undefined) updates.notes = body.notes ?? null

    const [updated] = await db.update(guests)
      .set(updates as Parameters<ReturnType<typeof db.update>['set']>[0])
      .where(eq(guests.id, guestId))
      .returning({
        id:              guests.id,
        name:            guests.name,
        email:           guests.email,
        phone:           guests.phone,
        instagramHandle: guests.instagramHandle,
        notes:           guests.notes,
      })
    return reply.send({ contact: updated })
  })

  // Keep old route as alias
  fastify.patch('/api/contacts/:contactId', { preHandler: staffPreHandler }, async (request, reply) => {
    const { contactId } = request.params as { contactId: string }
    const body = UpdateGuestSchema.parse(request.body)

    const [existing] = await db.select({ id: guests.id }).from(guests).where(eq(guests.id, contactId)).limit(1)
    if (!existing) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updates.name = body.name
    if (body.email !== undefined) updates.email = body.email?.toLowerCase() ?? null
    if (body.phone !== undefined) updates.phone = body.phone ?? null
    if (body.instagramHandle !== undefined) updates.instagramHandle = body.instagramHandle ?? null
    if (body.notes !== undefined) updates.notes = body.notes ?? null

    const [updated] = await db.update(guests)
      .set(updates as Parameters<ReturnType<typeof db.update>['set']>[0])
      .where(eq(guests.id, contactId))
      .returning({
        id:              guests.id,
        name:            guests.name,
        email:           guests.email,
        phone:           guests.phone,
        instagramHandle: guests.instagramHandle,
        notes:           guests.notes,
      })
    return reply.send({ contact: updated })
  })

  fastify.delete('/api/guests/:guestId', { preHandler: staffPreHandler }, async (request, reply) => {
    const { guestId } = request.params as { guestId: string }
    const [existing] = await db
      .select({ id: guests.id, userId: guests.userId })
      .from(guests)
      .where(eq(guests.id, guestId))
      .limit(1)
    if (!existing) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')
    if (existing.userId) {
      const [linked] = await db.select({ role: users.role }).from(users).where(eq(users.id, existing.userId)).limit(1)
      if (linked && (linked.role === 'admin' || linked.role === 'organizer')) {
        throw createError(403, 'FORBIDDEN', 'Cannot delete a guest entry linked to an operator account.')
      }
    }
    await db.delete(guests).where(eq(guests.id, guestId))
    return reply.code(204).send()
  })

  // Keep old route as alias
  fastify.delete('/api/contacts/:contactId', { preHandler: staffPreHandler }, async (request, reply) => {
    const { contactId } = request.params as { contactId: string }
    const [existing] = await db.select({ id: guests.id, userId: guests.userId }).from(guests).where(eq(guests.id, contactId)).limit(1)
    if (!existing) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')
    if (existing.userId) {
      const [linked] = await db.select({ role: users.role }).from(users).where(eq(users.id, existing.userId)).limit(1)
      if (linked && (linked.role === 'admin' || linked.role === 'organizer')) {
        throw createError(403, 'FORBIDDEN', 'Cannot delete a guest entry linked to an operator account.')
      }
    }
    await db.delete(guests).where(eq(guests.id, contactId))
    return reply.code(204).send()
  })

  // Single unified guest detail endpoint
  fastify.get('/api/admin/guests/:guestId', { preHandler: staffPreHandler }, async (request) => {
    const { guestId } = request.params as { guestId: string }

    const [guest] = await db
      .select({
        id:              guests.id,
        name:            guests.name,
        email:           guests.email,
        phone:           guests.phone,
        instagramHandle: guests.instagramHandle,
        notes:           guests.notes,
        userId:          guests.userId,
        passwordHash:    guests.passwordHash,
        status:          guests.status,
        statusReason:    guests.statusReason,
        createdAt:       guests.createdAt,
      })
      .from(guests)
      .where(eq(guests.id, guestId))
      .limit(1)
    if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const inviteRows = await db
      .select({
        tokenId:     eventTokens.id,
        eventSlug:   events.slug,
        eventTitle:  events.title,
        startsAt:    events.startsAt,
        timezone:    events.timezone,
        tokenStatus: eventTokens.status,
        visited:     sql<boolean>`${eventTokens.claimedBySessionId} is not null`,
        rsvpStatus:  rsvps.status,
        headCount:   rsvps.headCount,
      })
      .from(eventTokens)
      .innerJoin(events, eq(events.id, eventTokens.eventId))
      .leftJoin(rsvps, and(
        eq(rsvps.sessionId, eventTokens.claimedBySessionId),
        eq(rsvps.eventId, eventTokens.eventId),
      ))
      .where(eq(eventTokens.guestId, guestId))
      .orderBy(desc(events.startsAt))

    const rsvpRows = await db
      .select({
        eventSlug:     events.slug,
        eventTitle:    events.title,
        startsAt:      events.startsAt,
        timezone:      events.timezone,
        rsvpStatus:    rsvps.status,
        headCount:     rsvps.headCount,
        checkedIn:     rsvps.checkedIn,
        rsvpCreatedAt: rsvps.createdAt,
      })
      .from(rsvps)
      .innerJoin(events, eq(events.id, rsvps.eventId))
      .where(eq(rsvps.guestId, guestId))
      .orderBy(desc(events.startsAt))

    // Determine type
    let guestType = 'unclaimed'
    if (guest.passwordHash && guest.userId) {
      const [linkedUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, guest.userId)).limit(1)
      if (linkedUser?.role === 'admin') guestType = 'admin'
      else if (linkedUser?.role === 'organizer') guestType = 'organizer'
      else guestType = 'claimed'
    } else if (guest.passwordHash) {
      guestType = 'claimed'
    }

    return {
      guest: {
        id:              guest.id,
        shortId:         guest.id.slice(0, 8),
        type:            guestType,
        displayName:     guest.name,
        email:           guest.email,
        phone:           guest.phone,
        instagramHandle: guest.instagramHandle,
        notes:           guest.notes,
        status:          guest.status,
        statusReason:    guest.statusReason ?? null,
        firstSeen:       guest.createdAt.toISOString(),
        events:          rsvpRows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), rsvpCreatedAt: r.rsvpCreatedAt.toISOString() })),
        invites:         inviteRows.map((r) => ({
          tokenId:     r.tokenId,
          eventSlug:   r.eventSlug,
          eventTitle:  r.eventTitle,
          startsAt:    r.startsAt.toISOString(),
          timezone:    r.timezone,
          tokenStatus: r.tokenStatus,
          visited:     r.visited,
          rsvpStatus:  r.rsvpStatus ?? null,
          headCount:   r.headCount ?? null,
        })),
      },
    }
  })

  // Keep old endpoint as alias
  fastify.get('/api/admin/guests/contact/:contactId', { preHandler: staffPreHandler }, async (request, reply) => {
    const { contactId } = request.params as { contactId: string }

    const [guest] = await db
      .select({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone, instagramHandle: guests.instagramHandle, notes: guests.notes, userId: guests.userId, passwordHash: guests.passwordHash, status: guests.status, statusReason: guests.statusReason, createdAt: guests.createdAt })
      .from(guests).where(eq(guests.id, contactId)).limit(1)
    if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const inviteRows = await db
      .select({ tokenId: eventTokens.id, eventSlug: events.slug, eventTitle: events.title, startsAt: events.startsAt, timezone: events.timezone, tokenStatus: eventTokens.status, visited: sql<boolean>`${eventTokens.claimedBySessionId} is not null`, rsvpStatus: rsvps.status, headCount: rsvps.headCount })
      .from(eventTokens).innerJoin(events, eq(events.id, eventTokens.eventId))
      .leftJoin(rsvps, and(eq(rsvps.sessionId, eventTokens.claimedBySessionId), eq(rsvps.eventId, eventTokens.eventId)))
      .where(eq(eventTokens.guestId, contactId)).orderBy(desc(events.startsAt))

    const rsvpRows = await db
      .select({ eventSlug: events.slug, eventTitle: events.title, startsAt: events.startsAt, timezone: events.timezone, rsvpStatus: rsvps.status, headCount: rsvps.headCount, checkedIn: rsvps.checkedIn, rsvpCreatedAt: rsvps.createdAt })
      .from(rsvps).innerJoin(events, eq(events.id, rsvps.eventId))
      .where(eq(rsvps.guestId, contactId)).orderBy(desc(events.startsAt))

    let guestType = 'unclaimed'
    if (guest.passwordHash && guest.userId) {
      const [lu] = await db.select({ role: users.role }).from(users).where(eq(users.id, guest.userId)).limit(1)
      if (lu?.role === 'admin') guestType = 'admin'
      else if (lu?.role === 'organizer') guestType = 'organizer'
      else guestType = 'claimed'
    } else if (guest.passwordHash) {
      guestType = 'claimed'
    }

    return reply.send({
      guest: {
        id: guest.id, shortId: guest.id.slice(0, 8), type: guestType, displayName: guest.name, email: guest.email,
        phone: guest.phone, instagramHandle: guest.instagramHandle, notes: guest.notes, status: guest.status,
        statusReason: guest.statusReason ?? null, firstSeen: guest.createdAt.toISOString(),
        events: rsvpRows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), rsvpCreatedAt: r.rsvpCreatedAt.toISOString() })),
        invites: inviteRows.map((r) => ({ tokenId: r.tokenId, eventSlug: r.eventSlug, eventTitle: r.eventTitle, startsAt: r.startsAt.toISOString(), timezone: r.timezone, tokenStatus: r.tokenStatus, visited: r.visited, rsvpStatus: r.rsvpStatus ?? null, headCount: r.headCount ?? null })),
      },
    })
  })

  // Keep old session/user detail endpoints as aliases (return empty invites since they're now contact-based)
  fastify.get('/api/admin/guests/user/:guestId', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const { guestId } = request.params as { guestId: string }
    const isAdmin = user.role === 'admin'

    const [guestUser] = await db
      .select({ id: users.id, displayName: users.displayName, email: users.email, phone: users.phone, instagramHandle: users.instagramHandle, createdAt: users.createdAt, role: users.role })
      .from(users)
      .where(eq(users.id, guestId))
      .limit(1)
    if (!guestUser) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const eventRows = await db
      .select({ eventSlug: events.slug, eventTitle: events.title, startsAt: events.startsAt, timezone: events.timezone, rsvpStatus: rsvps.status, headCount: rsvps.headCount, checkedIn: rsvps.checkedIn, rsvpCreatedAt: rsvps.createdAt })
      .from(rsvps).innerJoin(events, eq(events.id, rsvps.eventId))
      .where(and(eq(rsvps.userId, guestId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
      .orderBy(desc(events.startsAt))

    return {
      guest: {
        id: guestUser.id, shortId: guestUser.id.slice(0, 8),
        type: guestUser.role === 'admin' ? 'admin' : guestUser.role === 'organizer' ? 'organizer' : 'claimed',
        displayName: guestUser.displayName, email: guestUser.email, phone: guestUser.phone,
        instagramHandle: guestUser.instagramHandle, status: 'active', statusReason: null,
        firstSeen: guestUser.createdAt.toISOString(),
        events: eventRows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), rsvpCreatedAt: r.rsvpCreatedAt.toISOString() })),
        invites: [],
      },
    }
  })

  fastify.get('/api/admin/guests/session/:guestId', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const { guestId } = request.params as { guestId: string }
    const isAdmin = user.role === 'admin'

    const [session] = await db
      .select({ id: visitorSessions.id, displayName: visitorSessions.displayName, email: visitorSessions.email, phone: visitorSessions.phone, instagramHandle: visitorSessions.instagramHandle, status: visitorSessions.status, statusReason: visitorSessions.statusReason, createdAt: visitorSessions.createdAt })
      .from(visitorSessions).where(eq(visitorSessions.id, guestId)).limit(1)
    if (!session) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const eventRows = await db
      .select({ eventSlug: events.slug, eventTitle: events.title, startsAt: events.startsAt, timezone: events.timezone, rsvpStatus: rsvps.status, headCount: rsvps.headCount, checkedIn: rsvps.checkedIn, rsvpCreatedAt: rsvps.createdAt })
      .from(rsvps).innerJoin(events, eq(events.id, rsvps.eventId))
      .where(and(eq(rsvps.sessionId, guestId), isNull(rsvps.userId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
      .orderBy(desc(events.startsAt))

    return {
      guest: {
        id: session.id, shortId: session.id.slice(0, 8), type: 'session',
        displayName: session.displayName ?? 'Anonymous', email: session.email ?? null,
        phone: session.phone ?? null, instagramHandle: session.instagramHandle ?? null,
        status: session.status, statusReason: session.statusReason ?? null,
        firstSeen: session.createdAt.toISOString(),
        events: eventRows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), rsvpCreatedAt: r.rsvpCreatedAt.toISOString() })),
        invites: [],
      },
    }
  })

  // ── Block / Unblock / Remove (session guests only) ───────────────────────

  fastify.patch('/api/admin/guests/session/:guestId/block', { preHandler: staffPreHandler }, async (request, reply) => {
    const actorId = request.user!.sub
    const { guestId } = request.params as { guestId: string }
    const body = BlockGuestSchema.parse(request.body)

    const [session] = await db
      .select({ id: visitorSessions.id, email: visitorSessions.email, status: visitorSessions.status })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, guestId))
      .limit(1)
    if (!session) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')
    if (session.status === 'removed') throw createError(409, 'GUEST_REMOVED', 'Cannot block a removed guest.')

    await db.transaction(async (tx) => {
      await tx.update(visitorSessions)
        .set({ status: 'blocked', statusReason: body.reason, statusAt: new Date(), statusBy: actorId })
        .where(eq(visitorSessions.id, guestId))

      const rsvpTokenIds = await tx
        .select({ tokenId: rsvps.tokenId })
        .from(rsvps)
        .where(and(eq(rsvps.sessionId, guestId), ne(rsvps.tokenId, sql`null`)))
      const tokenIds = rsvpTokenIds.map((r) => r.tokenId).filter(Boolean) as string[]
      for (const tid of tokenIds) {
        await tx.update(eventTokens).set({ status: 'blocked' }).where(and(eq(eventTokens.id, tid), eq(eventTokens.status, 'active')))
      }

      if (body.blockEmail && session.email) {
        await tx.insert(emailBlocklist)
          .values({ email: session.email.toLowerCase(), permanent: false, reason: body.reason, createdBy: actorId })
          .onConflictDoNothing()
      }
    })

    return reply.code(204).send()
  })

  fastify.patch('/api/admin/guests/session/:guestId/unblock', { preHandler: staffPreHandler }, async (request, reply) => {
    const { guestId } = request.params as { guestId: string }

    const [session] = await db
      .select({ id: visitorSessions.id, status: visitorSessions.status })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, guestId))
      .limit(1)
    if (!session) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')
    if (session.status !== 'blocked') throw createError(409, 'NOT_BLOCKED', 'Guest is not blocked.')

    await db.transaction(async (tx) => {
      await tx.update(visitorSessions)
        .set({ status: 'active', statusReason: null, statusAt: null, statusBy: null })
        .where(eq(visitorSessions.id, guestId))

      const rsvpTokenIds = await tx
        .select({ tokenId: rsvps.tokenId })
        .from(rsvps)
        .where(and(eq(rsvps.sessionId, guestId), ne(rsvps.tokenId, sql`null`)))
      const tokenIds = rsvpTokenIds.map((r) => r.tokenId).filter(Boolean) as string[]
      for (const tid of tokenIds) {
        await tx.update(eventTokens).set({ status: 'active' }).where(and(eq(eventTokens.id, tid), eq(eventTokens.status, 'blocked')))
      }
    })

    return reply.code(204).send()
  })

  fastify.delete('/api/admin/guests/session/:guestId', { preHandler: staffPreHandler }, async (request, reply) => {
    const actorId = request.user!.sub
    const { guestId } = request.params as { guestId: string }
    const body = RemoveGuestSchema.parse(request.body ?? {})

    const [session] = await db
      .select({ id: visitorSessions.id, email: visitorSessions.email })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, guestId))
      .limit(1)
    if (!session) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    await db.transaction(async (tx) => {
      await tx.update(visitorSessions)
        .set({ status: 'removed', statusAt: new Date(), statusBy: actorId })
        .where(eq(visitorSessions.id, guestId))

      const rsvpTokenIds = await tx
        .select({ tokenId: rsvps.tokenId })
        .from(rsvps)
        .where(and(eq(rsvps.sessionId, guestId), ne(rsvps.tokenId, sql`null`)))
      const tokenIds = rsvpTokenIds.map((r) => r.tokenId).filter(Boolean) as string[]
      for (const tid of tokenIds) {
        await tx.update(eventTokens).set({ status: 'blacklisted' }).where(eq(eventTokens.id, tid))
      }

      await tx.delete(rsvps).where(eq(rsvps.sessionId, guestId))

      if (body.blockEmail && session.email) {
        await tx.insert(emailBlocklist)
          .values({ email: session.email.toLowerCase(), permanent: true, createdBy: actorId })
          .onConflictDoUpdate({ target: emailBlocklist.email, set: { permanent: true, createdBy: actorId } })
      }
    })

    return reply.code(204).send()
  })
}

export default adminRoutes
