import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/index.js'
import { visitorSessions } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyRequest {
    session: {
      id: string
      displayName: string | null
      email: string | null
      eventAccess: Record<string, 'attendee' | 'editor'>
      userId: string | null
    } | null
  }
}

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('session', null)

  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const rawId = request.cookies['vsid']
    if (!rawId) return

    const sessionId = fastify.unsignCookie(rawId)
    if (!sessionId.valid || !sessionId.value) return

    const rows = await db
      .select({
        id: visitorSessions.id,
        displayName: visitorSessions.displayName,
        email: visitorSessions.email,
        eventAccess: visitorSessions.eventAccess,
        userId: visitorSessions.userId,
      })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, sessionId.value))
      .limit(1)

    const session = rows[0]
    if (!session) return

    request.session = {
      id: session.id,
      displayName: session.displayName,
      email: session.email,
      eventAccess: (session.eventAccess as Record<string, 'attendee' | 'editor'>) ?? {},
      userId: session.userId,
    }

    db.update(visitorSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(visitorSessions.id, session.id))
      .execute()
      .catch(() => {})
  })
}

export async function ensureSession(request: FastifyRequest, reply: FastifyReply) {
  if (request.session) return

  const rows = await db
    .insert(visitorSessions)
    .values({})
    .returning({
      id: visitorSessions.id,
      displayName: visitorSessions.displayName,
      email: visitorSessions.email,
      eventAccess: visitorSessions.eventAccess,
      userId: visitorSessions.userId,
    })

  const session = rows[0]
  if (!session) throw new Error('Failed to create visitor session')

  const signed = reply.request.server.signCookie(session.id)
  reply.setCookie('vsid', signed, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  request.session = {
    id: session.id,
    displayName: session.displayName,
    email: session.email,
    eventAccess: (session.eventAccess as Record<string, 'attendee' | 'editor'>) ?? {},
    userId: session.userId,
  }
}

export default fp(sessionPlugin)
