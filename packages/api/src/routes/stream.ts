import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { events } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { createError } from '../lib/errors.js'
import { subscribeToEvent } from '../lib/sse.js'

const streamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:slug/stream', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)
    if (!rows[0]) throw createError(404, 'EVENT_NOT_FOUND', 'No event found with this slug.')

    reply.hijack()

    const raw = reply.raw
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.setHeader('X-Accel-Buffering', 'no')
    raw.flushHeaders()

    const send = (event: string, data: unknown) => {
      if (!raw.destroyed) raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    // Initial heartbeat so the client knows the connection is live
    raw.write(': ping\n\n')

    const unsubscribe = subscribeToEvent(slug, send)
    const heartbeat = setInterval(() => { if (!raw.destroyed) raw.write(': ping\n\n') }, 30_000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      if (!raw.destroyed) raw.end()
    })
  })
}

export default streamRoutes
