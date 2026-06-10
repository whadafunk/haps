import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, events, instanceConfig, visitorSessions, rsvps } from '../db/schema.js'
import { eq, count, sql, and, isNull, desc } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateUserSchema } from '@haps/shared'
import { hashPassword } from '../lib/crypto.js'
import { config } from '../lib/config.js'
import { z } from 'zod'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require admin role
  const adminPreHandler = [fastify.requireRole('admin')]
  const staffPreHandler = [fastify.requireRole('organizer')]

  fastify.get('/api/admin/events', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const query = db
      .select({ slug: events.slug, title: events.title, status: events.status, startsAt: events.startsAt })
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
        instanceName: row?.instanceName ?? config.INSTANCE_NAME,
        smtpHost:     row?.smtpHost ?? config.SMTP_HOST ?? null,
        smtpPort:     row?.smtpPort ?? config.SMTP_PORT,
        smtpUser:     row?.smtpUser ?? config.SMTP_USER ?? null,
        smtpFrom:     row?.smtpFrom ?? config.SMTP_FROM ?? null,
        smtpConfigured: !!(row?.smtpHost ?? config.SMTP_HOST),
        storageType:  config.STORAGE_TYPE,
        defaultTheme: row?.defaultTheme ?? null,
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
        instanceName: row?.instanceName ?? config.INSTANCE_NAME,
        smtpHost:     row?.smtpHost ?? null,
        smtpPort:     row?.smtpPort ?? config.SMTP_PORT,
        smtpUser:     row?.smtpUser ?? null,
        smtpFrom:     row?.smtpFrom ?? null,
        smtpConfigured: !!(row?.smtpHost),
        storageType:  config.STORAGE_TYPE,
        defaultTheme: row?.defaultTheme ?? null,
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
          firstSeen:   sql<Date>`min(${rsvps.createdAt})`,
          eventCount:  sql<number>`count(distinct ${rsvps.eventId})::int`,
        })
        .from(rsvps)
        .innerJoin(visitorSessions, eq(rsvps.sessionId, visitorSessions.id))
        .innerJoin(events, eq(rsvps.eventId, events.id))
        .where(and(isNull(rsvps.userId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
        .groupBy(visitorSessions.id),
    ])

    const all = [...userRows, ...sessionRows].sort(
      (a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()
    )
    return { guests: all.map((g) => ({ ...g, firstSeen: new Date(g.firstSeen).toISOString() })) }
  })

  fastify.get('/api/admin/guests/user/:guestId', { preHandler: staffPreHandler }, async (request) => {
    const user = request.user!
    const { guestId } = request.params as { guestId: string }
    const isAdmin = user.role === 'admin'

    const [guest] = await db
      .select({ id: users.id, displayName: users.displayName, email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, guestId))
      .limit(1)
    if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const eventRows = await db
      .select({
        eventSlug:    events.slug,
        eventTitle:   events.title,
        startsAt:     events.startsAt,
        timezone:     events.timezone,
        rsvpStatus:   rsvps.status,
        headCount:    rsvps.headCount,
        checkedIn:    rsvps.checkedIn,
        rsvpCreatedAt: rsvps.createdAt,
      })
      .from(rsvps)
      .innerJoin(events, eq(events.id, rsvps.eventId))
      .where(and(eq(rsvps.userId, guestId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
      .orderBy(desc(events.startsAt))

    return {
      guest: {
        id: guest.id,
        type: 'user',
        displayName: guest.displayName,
        email: guest.email,
        firstSeen: guest.createdAt.toISOString(),
        events: eventRows.map((r) => ({
          ...r,
          startsAt: r.startsAt.toISOString(),
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
      .select({ id: visitorSessions.id, displayName: visitorSessions.displayName, email: visitorSessions.email, createdAt: visitorSessions.createdAt })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, guestId))
      .limit(1)
    if (!session) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')

    const eventRows = await db
      .select({
        eventSlug:    events.slug,
        eventTitle:   events.title,
        startsAt:     events.startsAt,
        timezone:     events.timezone,
        rsvpStatus:   rsvps.status,
        headCount:    rsvps.headCount,
        checkedIn:    rsvps.checkedIn,
        rsvpCreatedAt: rsvps.createdAt,
      })
      .from(rsvps)
      .innerJoin(events, eq(events.id, rsvps.eventId))
      .where(and(eq(rsvps.sessionId, guestId), isNull(rsvps.userId), isAdmin ? undefined : eq(events.organizerId, user.sub)))
      .orderBy(desc(events.startsAt))

    const displayName = session.displayName ?? 'Anonymous'
    const email = session.email ?? null

    return {
      guest: {
        id: session.id,
        type: 'session',
        displayName,
        email,
        firstSeen: session.createdAt.toISOString(),
        events: eventRows.map((r) => ({
          ...r,
          startsAt: r.startsAt.toISOString(),
          rsvpCreatedAt: r.rsvpCreatedAt.toISOString(),
        })),
      },
    }
  })
}

export default adminRoutes
