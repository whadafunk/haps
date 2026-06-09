import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, visitorSessions } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { verifyPassword, hashPassword } from '../lib/crypto.js'
import { signJwt, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js'
import { createError } from '../lib/errors.js'
import { LoginSchema, CreateUserSchema } from '@haps/shared'
import { config } from '../lib/config.js'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
      },
    },
  }, async (request, reply) => {
    const body = LoginSchema.parse(request.body)

    const [user] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, passwordHash: users.passwordHash, active: users.active })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1)

    if (!user) throw createError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')

    const valid = await verifyPassword(user.passwordHash, body.password)
    if (!valid) throw createError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')

    if (!user.active) throw createError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated.')

    const payload = { sub: user.id, email: user.email, role: user.role as 'admin' | 'organizer' | 'member' }
    const accessToken = signJwt(payload)
    const refreshToken = signRefreshToken(user.id)

    reply.setCookie('auth_token', accessToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60,
    })
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 60 * 60 * 24 * 7,
    })

    // Link the visitor session to this user account if one exists
    if (request.session) {
      db.update(visitorSessions)
        .set({ userId: user.id })
        .where(eq(visitorSessions.id, request.session.id))
        .execute()
        .catch(() => {})
      request.session.userId = user.id
    }

    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } }
  })

  fastify.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie('auth_token', { path: '/' })
    reply.clearCookie('refresh_token', { path: '/api/auth' })
    return reply.code(204).send()
  })

  fastify.post('/api/auth/refresh', async (request, reply) => {
    const rawRefresh = request.cookies.refresh_token
    if (!rawRefresh) throw createError(401, 'TOKEN_EXPIRED', 'Refresh token missing.')

    const payload = verifyRefreshToken(rawRefresh)
    if (!payload) throw createError(401, 'TOKEN_EXPIRED', 'Refresh token expired.')

    const [user] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1)

    if (!user) throw createError(401, 'TOKEN_EXPIRED', 'User not found.')

    const accessToken = signJwt({ sub: user.id, email: user.email, role: user.role as 'admin' | 'organizer' | 'member' })
    reply.setCookie('auth_token', accessToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60,
    })

    return reply.code(200).send()
  })

  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = request.user!
    const [row] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, subscribed: users.subscribed })
      .from(users)
      .where(eq(users.id, user.sub))
      .limit(1)
    if (!row) throw createError(401, 'UNAUTHORIZED', 'User not found.')
    return { id: row.id, email: row.email, displayName: row.displayName, role: row.role, subscribed: row.subscribed }
  })
}

export default authRoutes
