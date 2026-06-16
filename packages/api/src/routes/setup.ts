import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, instanceConfig } from '../db/schema.js'
import { eq, count } from 'drizzle-orm'
import { hashPassword } from '../lib/crypto.js'
import { createError } from '../lib/errors.js'
import { z } from 'zod'

const SetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(200),
}).strict()

async function adminCount(): Promise<number> {
  const rows = await db.select({ n: count() }).from(users).where(eq(users.role, 'admin'))
  return Number(rows[0]?.n ?? 0)
}

const setupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/setup/status', async () => {
    const [cfg] = await db.select({ requireRsvpBeforeRegister: instanceConfig.requireRsvpBeforeRegister }).from(instanceConfig).limit(1)
    return {
      setupRequired: (await adminCount()) === 0,
      requireRsvpBeforeRegister: cfg?.requireRsvpBeforeRegister ?? true,
    }
  })

  fastify.post('/api/setup', async (request, reply) => {
    if ((await adminCount()) > 0) {
      throw createError(403, 'SETUP_ALREADY_COMPLETE', 'Setup has already been completed.')
    }

    const body = SetupSchema.parse(request.body)
    const passwordHash = await hashPassword(body.password)

    const inserted = await db.insert(users).values({
      email: body.email,
      passwordHash,
      displayName: body.displayName,
      role: 'admin',
    }).returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })

    const user = inserted[0]
    if (!user) throw createError(500, 'INTERNAL_ERROR', 'Failed to create admin user.')

    return reply.code(201).send({ user })
  })
}

export default setupRoutes
