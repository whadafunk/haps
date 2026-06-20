import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { getVapidPublicKey } from '../services/push.js'

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
}).strict()

const pushRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/push/vapid-public-key', async () => {
    const publicKey = await getVapidPublicKey()
    if (!publicKey) throw createError(503, 'PUSH_NOT_CONFIGURED', 'Push notifications are not configured.')
    return { publicKey }
  })

  fastify.post('/api/push/subscribe', async (request, reply) => {
    const session = request.session
    if (!session) throw createError(401, 'NO_SESSION', 'No session found.')

    const body = SubscribeSchema.parse(request.body)

    await db
      .insert(pushSubscriptions)
      .values({
        sessionId: session.id,
        endpoint:  body.endpoint,
        p256dh:    body.keys.p256dh,
        authKey:   body.keys.auth,
      })
      .onConflictDoUpdate({
        target:    [pushSubscriptions.sessionId, pushSubscriptions.endpoint],
        set:       { p256dh: body.keys.p256dh, authKey: body.keys.auth },
      })

    return reply.code(204).send()
  })

  fastify.delete('/api/push/subscribe', async (request, reply) => {
    const session = request.session
    if (!session) throw createError(401, 'NO_SESSION', 'No session found.')

    const body = z.object({ endpoint: z.string().url() }).strict().parse(request.body)

    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.sessionId, session.id), eq(pushSubscriptions.endpoint, body.endpoint)))

    return reply.code(204).send()
  })
}

export default pushRoutes
