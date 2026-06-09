import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import fp from 'fastify-plugin'
import { config } from '../lib/config.js'
import { createError } from '../lib/errors.js'

export interface JwtPayload {
  sub: string
  email: string
  role: 'admin' | 'organizer' | 'member'
  iat?: number
  exp?: number
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (role: 'admin' | 'organizer') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: JwtPayload | null
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('user', null)

  // Silently populate request.user on every request if auth_token is present
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const token = request.cookies['auth_token']
    if (!token) return
    try {
      request.user = jwt.verify(token, config.JWT_SECRET) as JwtPayload
    } catch {
      // Token invalid — leave request.user as null
    }
  })

  fastify.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    const token = request.cookies.auth_token
    if (!token) throw createError(401, 'UNAUTHORIZED', 'Authentication required.')

    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload
      request.user = payload
    } catch {
      throw createError(401, 'TOKEN_EXPIRED', 'Session expired. Please log in again.')
    }
  })

  fastify.decorate('requireRole', (role: 'admin' | 'organizer') => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      await fastify.authenticate(request, _reply)
      if (!request.user) throw createError(401, 'UNAUTHORIZED', 'Authentication required.')
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

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: '7d' })
}

export function verifyRefreshToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, config.JWT_SECRET) as { sub: string }
  } catch {
    return null
  }
}

export default fp(authPlugin)
