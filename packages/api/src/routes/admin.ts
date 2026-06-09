import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, events } from '../db/schema.js'
import { eq, count } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { CreateUserSchema } from '@haps/shared'
import { hashPassword } from '../lib/crypto.js'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require admin role
  const adminPreHandler = [fastify.requireRole('admin')]

  fastify.get('/api/admin/events', { preHandler: adminPreHandler }, async () => {
    const rows = await db
      .select({
        slug: events.slug,
        title: events.title,
        status: events.status,
        startsAt: events.startsAt,
      })
      .from(events)
      .orderBy(events.startsAt)

    return { events: rows.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })) }
  })

  fastify.get('/api/admin/users', { preHandler: adminPreHandler }, async () => {
    const rows = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, createdAt: users.createdAt })
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

  fastify.delete('/api/admin/users/:userId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const [existing] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
    if (!existing) throw createError(404, 'USER_NOT_FOUND', 'User not found.')
    if (existing.role === 'admin') throw createError(403, 'FORBIDDEN', 'Cannot delete admin users.')
    await db.delete(users).where(eq(users.id, userId))
    return reply.code(204).send()
  })

  fastify.get('/api/admin/config', { preHandler: adminPreHandler }, async () => {
    // Config stored in env for Phase 1
    return {
      config: {
        instanceName: process.env.INSTANCE_NAME ?? 'Haps',
        smtpConfigured: !!(process.env.SMTP_HOST),
        storageType: process.env.STORAGE_TYPE ?? 'local',
      },
    }
  })
}

export default adminRoutes
