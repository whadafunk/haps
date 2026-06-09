import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { db } from '../db/index.js'
import { eventTokens, events, visitorSessions } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { verifyToken } from '../lib/crypto.js'
import { createError } from '../lib/errors.js'

declare module 'fastify' {
  interface FastifyInstance {
    requireEditToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    isEditor: boolean
    editTokenId: string | null
  }
}

const editTokenPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('isEditor', false)
  fastify.decorateRequest('editTokenId', null)

  // Silently set isEditor on every request so endpoints that check request.isEditor
  // directly still work for session editors, admin/organizer JWT, and x-edit-token header.
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (request.isEditor) return
    const params = request.params as Record<string, string | undefined>
    const slug = params['slug']
    if (!slug) return

    if (request.session?.eventAccess?.[slug] === 'editor') {
      request.isEditor = true
      return
    }
    if (request.user?.role === 'admin' || request.user?.role === 'organizer') {
      request.isEditor = true
      return
    }

    // Validate x-edit-token header so routes that only check request.isEditor
    // (no explicit requireEditToken call) still recognise header-based auth.
    const rawToken = request.headers['x-edit-token'] as string | undefined
    if (!rawToken) return

    const [row] = await db
      .select({ id: eventTokens.id, tokenHash: eventTokens.tokenHash })
      .from(eventTokens)
      .innerJoin(events, eq(events.id, eventTokens.eventId))
      .where(and(eq(events.slug, slug), eq(eventTokens.type, 'edit'), eq(eventTokens.revoked, false)))
      .limit(1)

    if (!row) return

    const valid = await verifyToken(row.tokenHash, rawToken)
    if (!valid) return

    request.isEditor = true
    request.editTokenId = row.id

    if (request.session) {
      const updatedAccess: Record<string, 'attendee' | 'editor'> = {
        ...request.session.eventAccess,
        [slug]: 'editor',
      }
      request.session.eventAccess = updatedAccess
      await db
        .update(visitorSessions)
        .set({ eventAccess: updatedAccess })
        .where(eq(visitorSessions.id, request.session.id))
    }
  })

  fastify.decorate('requireEditToken', async (request: FastifyRequest, _reply: FastifyReply) => {
    const params = request.params as Record<string, string | undefined>
    const slug = params['slug']
    if (!slug) throw createError(400, 'BAD_REQUEST', 'Event slug is required.')

    if (request.session?.eventAccess?.[slug] === 'editor') {
      request.isEditor = true
      return
    }

    if (request.user?.role === 'admin' || request.user?.role === 'organizer') {
      request.isEditor = true
      return
    }

    const rawToken = request.headers['x-edit-token'] as string | undefined
    if (!rawToken) throw createError(403, 'INVALID_EDIT_TOKEN', 'Edit token required.')

    const [row] = await db
      .select({ id: eventTokens.id, tokenHash: eventTokens.tokenHash })
      .from(eventTokens)
      .innerJoin(events, eq(events.id, eventTokens.eventId))
      .where(and(eq(events.slug, slug), eq(eventTokens.type, 'edit'), eq(eventTokens.revoked, false)))
      .limit(1)

    if (!row) throw createError(403, 'INVALID_EDIT_TOKEN', 'Edit token invalid.')

    const valid = await verifyToken(row.tokenHash, rawToken)
    if (!valid) throw createError(403, 'INVALID_EDIT_TOKEN', 'Edit token invalid.')

    request.isEditor = true
    request.editTokenId = row.id

    if (request.session) {
      const updatedAccess: Record<string, 'attendee' | 'editor'> = {
        ...request.session.eventAccess,
        [slug]: 'editor',
      }
      request.session.eventAccess = updatedAccess
      await db
        .update(visitorSessions)
        .set({ eventAccess: updatedAccess })
        .where(eq(visitorSessions.id, request.session.id))
    }
  })
}

export default fp(editTokenPlugin)
