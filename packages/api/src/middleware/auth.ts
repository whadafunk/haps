import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import fp from 'fastify-plugin'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { config } from '../lib/config.js'
import { createError } from '../lib/errors.js'

export interface JwtPayload {
  sub: string
  type: 'operator' | 'guest'
  role?: 'admin' | 'organizer'
  email?: string
  iat?: number
  exp?: number
}

export type AuthUser =
  | { sub: string; type: 'operator'; role: 'admin' | 'organizer' }
  | { sub: string; type: 'guest'; role?: undefined }

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (role: 'admin' | 'organizer') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: AuthUser | null
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('user', null)

  // Silently populate request.user on every request if auth_token is present
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const token = request.cookies['auth_token']
    if (!token) return
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload
      if (payload.type === 'guest') {
        request.user = { sub: payload.sub, type: 'guest' }
      } else {
        // 'operator' type or legacy tokens without type (backward compat)
        request.user = { sub: payload.sub, type: 'operator', role: (payload.role ?? 'organizer') as 'admin' | 'organizer' }
      }
    } catch {
      // Token invalid — leave request.user as null
    }
  })

  fastify.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    const token = request.cookies.auth_token
    if (!token) throw createError(401, 'UNAUTHORIZED', 'Authentication required.')

    let payload: JwtPayload
    try {
      payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload
    } catch {
      throw createError(401, 'TOKEN_EXPIRED', 'Session expired. Please log in again.')
    }

    // Only do DB active-check for operators — guests don't have an active flag
    if (payload.type !== 'guest') {
      const [row] = await db
        .select({ active: users.active })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1)

      if (!row || !row.active) throw createError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated.')

      request.user = { sub: payload.sub, type: 'operator', role: (payload.role ?? 'organizer') as 'admin' | 'organizer' }
    } else {
      request.user = { sub: payload.sub, type: 'guest' }
    }
  })

  fastify.decorate('requireRole', (role: 'admin' | 'organizer') => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      await fastify.authenticate(request, _reply)
      if (!request.user) throw createError(401, 'UNAUTHORIZED', 'Authentication required.')
      if (request.user.type !== 'operator') {
        throw createError(403, 'FORBIDDEN', 'Operator access required.')
      }
      if (role === 'admin' && request.user.role !== 'admin') {
        throw createError(403, 'FORBIDDEN', 'Admin access required.')
      }
      if (role === 'organizer' && request.user.role !== 'admin' && request.user.role !== 'organizer') {
        throw createError(403, 'FORBIDDEN', 'Organizer access required.')
      }
    }
  })
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '1h' })
}

export function signRefreshToken(id: string): string {
  return jwt.sign({ sub: id }, config.JWT_SECRET, { expiresIn: '7d' })
}

export function verifyRefreshToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, config.JWT_SECRET) as { sub: string }
  } catch {
    return null
  }
}

export default fp(authPlugin)
