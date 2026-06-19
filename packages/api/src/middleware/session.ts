import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/index.js'
import { visitorSessions } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

export type EventAccessValue = 'attendee' | 'editor' | { role: 'attendee'; tokenId: string }

export function hasAttendeeAccess(access: EventAccessValue | undefined): boolean {
  return access === 'attendee' || (typeof access === 'object' && access !== null && access.role === 'attendee')
}

export function getPendingTokenId(access: EventAccessValue | undefined): string | null {
  if (typeof access === 'object' && access !== null && access.role === 'attendee') return access.tokenId
  return null
}

declare module 'fastify' {
  interface FastifyRequest {
    session: {
      id: string
      displayName: string | null
      email: string | null
      phone: string | null
      instagramHandle: string | null
      status: string
      statusReason: string | null
      eventAccess: Record<string, EventAccessValue>
      userId: string | null
      guestId: string | null
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
        id:              visitorSessions.id,
        displayName:     visitorSessions.displayName,
        email:           visitorSessions.email,
        phone:           visitorSessions.phone,
        instagramHandle: visitorSessions.instagramHandle,
        status:          visitorSessions.status,
        statusReason:    visitorSessions.statusReason,
        eventAccess:     visitorSessions.eventAccess,
        userId:          visitorSessions.userId,
        guestId:         visitorSessions.guestId,
      })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, sessionId.value))
      .limit(1)

    const session = rows[0]
    if (!session) return

    request.session = {
      id:              session.id,
      displayName:     session.displayName,
      email:           session.email,
      phone:           session.phone,
      instagramHandle: session.instagramHandle,
      status:          session.status,
      statusReason:    session.statusReason,
      eventAccess:     (session.eventAccess as Record<string, EventAccessValue>) ?? {},
      userId:          session.userId,
      guestId:         session.guestId,
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

  // Link the new session to the authenticated user/guest immediately if one is present
  const userId = (request.user?.type === 'operator') ? request.user.sub : null
  const guestId = (request.user?.type === 'guest') ? request.user.sub : null

  const rows = await db
    .insert(visitorSessions)
    .values({ userId: userId ?? null, guestId: guestId ?? null })
    .returning({
      id:              visitorSessions.id,
      displayName:     visitorSessions.displayName,
      email:           visitorSessions.email,
      phone:           visitorSessions.phone,
      instagramHandle: visitorSessions.instagramHandle,
      status:          visitorSessions.status,
      statusReason:    visitorSessions.statusReason,
      eventAccess:     visitorSessions.eventAccess,
      userId:          visitorSessions.userId,
      guestId:         visitorSessions.guestId,
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
    id:              session.id,
    displayName:     session.displayName,
    email:           session.email,
    phone:           session.phone,
    instagramHandle: session.instagramHandle,
    status:          session.status ?? 'active',
    statusReason:    session.statusReason,
    eventAccess:     (session.eventAccess as Record<string, EventAccessValue>) ?? {},
    userId:          session.userId,
    guestId:         session.guestId,
  }
}

export default fp(sessionPlugin)
