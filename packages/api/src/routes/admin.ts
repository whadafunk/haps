import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, events, instanceConfig, visitorSessions, rsvps, eventTokens, emailBlocklist, contacts } from '../db/schema.js'
import { eq, count, sql, and, isNull, isNotNull, or, desc, ne } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateUserSchema, BlockGuestSchema, RemoveGuestSchema, CreateContactSchema, UpdateContactSchema } from '@haps/shared'
import { hashPassword } from '../lib/crypto.js'
import { config } from '../lib/config.js'
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
    smtpPort:     z.coerce.number().int().min(1).max(65535).optional(),
    smtpUser:     z.string().max(200).nullable().optional(),
    smtpPass:     z.string().max(200).nullable().optional(),
    smtpFrom:     z.string().max(200).nullable().optional(),
    defaultTheme: z.string().max(50).nullable().optional(),
  }).strict()

  fastify.get('/api/admin/config', { preHandler: adminPreHandler }, async () => {
    const [row] = await db.select().from(instanceConfig).limit(1)

    return {
      config: {
        instanceName:   row?.instanceName ?? config.INSTANCE_NAME,
        smtpHost:       row?.smtpHost ?? config.SMTP_HOST ?? null,
        smtpPort:       row?.smtpPort ?? config.SMTP_PORT,
        smtpUser:       row?.smtpUser ?? config.SMTP_USER ?? null,
        smtpFrom:       row?.smtpFrom ?? config.SMTP_FROM ?? null,
        smtpConfigured: !!(row?.smtpHost ?? config.SMTP_HOST),
        storageType:    config.STORAGE_TYPE,
        defaultTheme:   row?.defaultTheme ?? null,
      },
    }
  })

  fastify.patch('/api/admin/config', { preHandler: adminPreHandler }, async (request) => {
    const body = UpdateConfigSchema.parse(request.body)

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.instanceName !== undefined) updates['instanceName'] = body.instanceName
    if (body.smtpHost !== undefined) updates['smtpHost'] = body.smtpHost
    if (body.smtpPort !== undefined) updates['smtpPort'] = body.smtpPort
    if (body.smtpUser !== undefined) updates['smtpUser'] = body.smtpUser
    if (body.smtpPass !== undefined) updates['smtpPass'] = body.smtpPass
    if (body.smtpFrom !== undefined) updates['smtpFrom'] = body.smtpFrom
    if (body.defaultTheme !== undefined) updates['defaultTheme'] = body.defaultTheme

    await db.insert(instanceConfig)
      .values({ id: 'singleton', ...updates })
      .onConflictDoUpdate({ target: instanceConfig.id, set: updates as Parameters<ReturnType<typeof db.update>['set']>[0] })

    const [row] = await db.select().from(instanceConfig).limit(1)
    return {
      config: {
        instanceName:   row?.instanceName ?? config.INSTANCE_NAME,
        smtpHost:       row?.smtpHost ?? null,
        smtpPort:       row?.smtpPort ?? config.SMTP_PORT,
        smtpUser:       row?.smtpUser ?? null,
        smtpFrom:       row?.smtpFrom ?? null,
        smtpConfigured: !!(row?.smtpHost),
        storageType:    config.STORAGE_TYPE,
        defaultTheme:   row?.defaultTheme ?? null,
      },
    }
  })

  // ── People directory ─────────────────────────────────────────────────────

  fastify.get('/api/admin/guests', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const isAdmin = user.role === 'admin'

    const [userRows, sessionRows] = await Promise.all([
      db
        .select({
          id:          users.id,
          type:        sql<string>`'user'`,
          displayName: users.displayName,
          email:       users.email,
          status:      sql<string>`'active'`,
          firstSeen:   sql<Date>`min(${rsvps.createdAt})`,
          eventCount:  sql<number>`count(distinct ${rsvps.eventId})::int`,
        })
        .from(rsvps)
        .innerJoin(users, eq(rsvps.userId, users.id))
        .innerJoin(events, eq(rsvps.eventId, events.id))
        .where(and(eq(users.role, 'member'), isAdmin ? undefined : eq(events.organizerId, user.sub)))
        .groupBy(users.id),

      db
        .select({
          id:          visitorSessions.id,
          type:        sql<string>`'session'`,
          displayName: sql<string>`coalesce(${visitorSessions.displayName}, max(${rsvps.displayName}))`,
          email:       sql<string | null>`coalesce(${visitorSessions.email}, max(${rsvps.email}))`,
          status:      visitorSessions.status,
          firstSeen:   sql<Date>`min(${rsvps.createdAt})`,
          eventCount:  sql<number>`count(distinct ${rsvps.eventId})::int`,
        })
        .from(rsvps)
        .innerJoin(visitorSessions, eq(rsvps.sessionId, visitorSessions.id))
        .innerJoin(events, eq(rsvps.eventId, events.id))
        .where(and(isNull(rsvps.userId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
        .groupBy(visitorSessions.id),
    ])

    // Contacts that are not yet represented by a session or user (directory-only people)
    const contactRows = await db
      .select({
        id:          contacts.id,
        type:        sql<string>`'contact'`,
        displayName: contacts.name,
        email:       contacts.email,
        status:      sql<string>`'active'`,
        firstSeen:   contacts.createdAt,
        eventCount:  sql<number>`0`,
      })
      .from(contacts)
      .where(or(
        isNull(contacts.email),
        and(
          isNotNull(contacts.email),
          sql`not exists (select 1 from visitor_sessions vs where vs.email = contacts.email)`,
          sql`not exists (select 1 from users u where u.email = contacts.email)`,
        ),
      ))

    const all = [...userRows, ...sessionRows, ...contactRows].sort(
      (a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()
    )
    return { guests: all.map((g) => ({ ...g, firstSeen: new Date(g.firstSeen).toISOString() })) }
  })

  fastify.post('/api/contacts', { preHandler: staffPreHandler }, async (request, reply) => {
    const body = CreateContactSchema.parse(request.body)
    const [contact] = await db.insert(contacts).values({
      name:            body.name,
      email:           body.email?.toLowerCase() ?? null,
      phone:           body.phone ?? null,
      instagramHandle: body.instagramHandle ?? null,
      notes:           body.notes ?? null,
    }).returning({ id: contacts.id, name: contacts.name, email: contacts.email })
    if (!contact) throw createError(500, 'INTERNAL_ERROR', 'Failed to create contact.')
    return reply.code(201).send({ contact })
  })

  fastify.patch('/api/contacts/:contactId', { preHandler: staffPreHandler }, async (request, reply) => {
    const { contactId } = request.params as { contactId: string }
    const body = UpdateContactSchema.parse(request.body)

    const [existing] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactId)).limit(1)
    if (!existing) throw createError(404, 'CONTACT_NOT_FOUND', 'Contact not found.')

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updates.name = body.name
    if (body.email !== undefined) updates.email = body.email?.toLowerCase() ?? null
    if (body.phone !== undefined) updates.phone = body.phone ?? null
    if (body.instagramHandle !== undefined) updates.instagramHandle = body.instagramHandle ?? null
    if (body.notes !== undefined) updates.notes = body.notes ?? null

    const [updated] = await db.update(contacts)
      .set(updates as Parameters<ReturnType<typeof db.update>['set']>[0])
      .where(eq(contacts.id, contactId))
      .returning({
        id:              contacts.id,
        name:            contacts.name,
        email:           contacts.email,
        phone:           contacts.phone,
        instagramHandle: contacts.instagramHandle,
        notes:           contacts.notes,
      })
    return reply.send({ contact: updated })
  })

  fastify.delete('/api/contacts/:contactId', { preHandler: staffPreHandler }, async (request, reply) => {
    const { contactId } = request.params as { contactId: string }
    const [existing] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactId)).limit(1)
    if (!existing) throw createError(404, 'CONTACT_NOT_FOUND', 'Contact not found.')
    await db.delete(contacts).where(eq(contacts.id, contactId))
    return reply.code(204).send()
  })

  fastify.get('/api/admin/guests/contact/:contactId', { preHandler: staffPreHandler }, async (request) => {
    const { contactId } = request.params as { contactId: string }

    const [contact] = await db
      .select({
        id:              contacts.id,
        name:            contacts.name,
        email:           contacts.email,
        phone:           contacts.phone,
        instagramHandle: contacts.instagramHandle,
        notes:           contacts.notes,
        createdAt:       contacts.createdAt,
      })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)
    if (!contact) throw createError(404, 'CONTACT_NOT_FOUND', 'Contact not found.')

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
      .where(eq(eventTokens.contactId, contactId))
      .orderBy(desc(events.startsAt))

    return {
      guest: {
        id:              contact.id,
        shortId:         contact.id.slice(0, 8),
        type:            'contact',
        displayName:     contact.name,
        email:           contact.email,
        phone:           contact.phone,
        instagramHandle: contact.instagramHandle,
        notes:           contact.notes,
        status:          'active',
        statusReason:    null,
        firstSeen:       contact.createdAt.toISOString(),
        events:          [],
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

  fastify.get('/api/admin/guests/user/:guestId', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const { guestId } = request.params as { guestId: string }
    const isAdmin = user.role === 'admin'

    const [guest] = await db
      .select({ id: users.id, displayName: users.displayName, email: users.email, phone: users.phone, instagramHandle: users.instagramHandle, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, guestId))
      .limit(1)
    if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const eventRows = await db
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
      .where(and(eq(rsvps.userId, guestId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
      .orderBy(desc(events.startsAt))

    return {
      guest: {
        id:              guest.id,
        shortId:         guest.id.slice(0, 8),
        type:            'user',
        displayName:     guest.displayName,
        email:           guest.email,
        phone:           guest.phone,
        instagramHandle: guest.instagramHandle,
        status:          'active',
        statusReason:    null,
        firstSeen:       guest.createdAt.toISOString(),
        events: eventRows.map((r) => ({
          ...r,
          startsAt:      r.startsAt.toISOString(),
          rsvpCreatedAt: r.rsvpCreatedAt.toISOString(),
        })),
      },
    }
  })

  fastify.get('/api/admin/guests/session/:guestId', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const { guestId } = request.params as { guestId: string }
    const isAdmin = user.role === 'admin'

    const [session] = await db
      .select({
        id:              visitorSessions.id,
        displayName:     visitorSessions.displayName,
        email:           visitorSessions.email,
        phone:           visitorSessions.phone,
        instagramHandle: visitorSessions.instagramHandle,
        status:          visitorSessions.status,
        statusReason:    visitorSessions.statusReason,
        createdAt:       visitorSessions.createdAt,
      })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, guestId))
      .limit(1)
    if (!session) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const eventRows = await db
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
      .where(and(eq(rsvps.sessionId, guestId), isNull(rsvps.userId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
      .orderBy(desc(events.startsAt))

    return {
      guest: {
        id:              session.id,
        shortId:         session.id.slice(0, 8),
        type:            'session',
        displayName:     session.displayName ?? 'Anonymous',
        email:           session.email ?? null,
        phone:           session.phone ?? null,
        instagramHandle: session.instagramHandle ?? null,
        status:          session.status,
        statusReason:    session.statusReason ?? null,
        firstSeen:       session.createdAt.toISOString(),
        events: eventRows.map((r) => ({
          ...r,
          startsAt:      r.startsAt.toISOString(),
          rsvpCreatedAt: r.rsvpCreatedAt.toISOString(),
        })),
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

      // Block all active attendee tokens linked via RSVPs for this session
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

      // Re-activate their tokens that were blocked (not blacklisted)
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

      // Blacklist all their tokens permanently
      const rsvpTokenIds = await tx
        .select({ tokenId: rsvps.tokenId })
        .from(rsvps)
        .where(and(eq(rsvps.sessionId, guestId), ne(rsvps.tokenId, sql`null`)))
      const tokenIds = rsvpTokenIds.map((r) => r.tokenId).filter(Boolean) as string[]
      for (const tid of tokenIds) {
        await tx.update(eventTokens).set({ status: 'blacklisted' }).where(eq(eventTokens.id, tid))
      }

      // Delete all RSVPs
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
