import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, visitorSessions, rsvps, comments, magicLinks } from '../db/schema.js'
import { eq, and, lt, count } from 'drizzle-orm'
import { verifyPassword, hashPassword, generateToken, sha256hex } from '../lib/crypto.js'
import { signJwt, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js'
import { createError } from '../lib/errors.js'
import { LoginSchema, CreateUserSchema, UpdateProfileSchema, ChangePasswordSchema, RegisterSchema, MagicLinkRequestSchema, MagicLinkVerifySchema } from '@haps/shared'
import { config } from '../lib/config.js'
import { sendEmail } from '../services/email.js'

/** Atomically claim a visitor session's RSVPs, comments, and event_access into a user account. */
async function mergeSessionIntoUser(sessionId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // RSVPs: claim uncontested ones; discard session copy where user already has one
    const sessionRsvps = await tx
      .select({ id: rsvps.id, eventId: rsvps.eventId })
      .from(rsvps)
      .where(eq(rsvps.sessionId, sessionId))

    for (const rsvp of sessionRsvps) {
      const [conflict] = await tx
        .select({ id: rsvps.id })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, rsvp.eventId), eq(rsvps.userId, userId)))
        .limit(1)

      if (conflict) {
        await tx.delete(rsvps).where(eq(rsvps.id, rsvp.id))
      } else {
        await tx.update(rsvps)
          .set({ userId, sessionId: null })
          .where(eq(rsvps.id, rsvp.id))
      }
    }

    // Comments: claim all
    await tx.update(comments)
      .set({ userId, sessionId: null })
      .where(eq(comments.sessionId, sessionId))

    // Link session to user
    await tx.update(visitorSessions)
      .set({ userId })
      .where(eq(visitorSessions.id, sessionId))
  })
}

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

    if (request.session) {
      if (body.skipMerge) {
        // Discard the anonymous session — create a fresh one linked to this user
        const freshSessions = await db.insert(visitorSessions)
          .values({ userId: user.id })
          .returning({ id: visitorSessions.id })
        if (!freshSessions[0]) throw createError(500, 'INTERNAL_ERROR', 'Failed to create session.')
        reply.setCookie('vsid', freshSessions[0].id, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
          signed: true,
        })
      } else {
        // Merge anonymous session history into the account
        request.session.userId = user.id
        await mergeSessionIntoUser(request.session.id, user.id)
      }
    }

    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } }
  })


  fastify.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie('auth_token', { path: '/' })
    reply.clearCookie('refresh_token', { path: '/api/auth' })
    return reply.code(204).send()
  })

  fastify.post('/api/auth/register', {
    config: {
      rateLimit: { max: 5, timeWindow: '15 minutes' },
    },
  }, async (request, reply) => {
    const body = RegisterSchema.parse(request.body)

    // Must have RSVPed to at least one event — registration is an upgrade, not a cold signup
    if (!request.session) throw createError(403, 'NO_EVENT_HISTORY', 'RSVP to at least one event before creating an account.')
    const countRows = await db
      .select({ rsvpCount: count() })
      .from(rsvps)
      .where(eq(rsvps.sessionId, request.session.id))
    if ((countRows[0]?.rsvpCount ?? 0) === 0) throw createError(403, 'NO_EVENT_HISTORY', 'RSVP to at least one event before creating an account.')

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1)

    if (existing) throw createError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.')

    const passwordHash = await hashPassword(body.password)
    const [newUser] = await db
      .insert(users)
      .values({ email: body.email, passwordHash, displayName: body.displayName, role: 'member' })
      .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })

    if (!newUser) throw createError(500, 'INTERNAL_ERROR', 'Failed to create account.')

    // Merge current visitor session into the new account
    if (request.session) {
      request.session.userId = newUser.id
      await mergeSessionIntoUser(request.session.id, newUser.id)
    }

    const payload = { sub: newUser.id, email: newUser.email, role: 'member' as const }
    const accessToken = signJwt(payload)
    const refreshToken = signRefreshToken(newUser.id)

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

    return reply.code(201).send({ user: { id: newUser.id, email: newUser.email, displayName: newUser.displayName, role: newUser.role } })
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
  fastify.patch('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = request.user!
    const body = UpdateProfileSchema.parse(request.body)

    const [updated] = await db
      .update(users)
      .set({ displayName: body.displayName, updatedAt: new Date() })
      .where(eq(users.id, user.sub))
      .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })

    if (!updated) throw createError(404, 'USER_NOT_FOUND', 'User not found.')
    return { user: updated }
  })

  fastify.post('/api/auth/change-password', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!
    const body = ChangePasswordSchema.parse(request.body)

    const [row] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.sub))
      .limit(1)

    if (!row) throw createError(404, 'USER_NOT_FOUND', 'User not found.')

    const valid = await verifyPassword(row.passwordHash, body.currentPassword)
    if (!valid) throw createError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.')

    const newHash = await hashPassword(body.newPassword)
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.sub))

    return reply.code(204).send()
  })

  fastify.delete('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!

    const [row] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, user.sub))
      .limit(1)

    if (!row) throw createError(404, 'USER_NOT_FOUND', 'User not found.')
    if (row.role === 'admin') throw createError(400, 'CANNOT_DELETE_ADMIN', 'Admin accounts cannot be self-deleted. Use user management.')

    await db.delete(users).where(eq(users.id, user.sub))

    reply.clearCookie('auth_token', { path: '/' })
    reply.clearCookie('refresh_token', { path: '/api/auth' })
    return reply.code(204).send()
  })

  fastify.post('/api/auth/magic-link', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = MagicLinkRequestSchema.parse(request.body)

    const [user] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1)

    // Always 204 — never reveal whether the email exists
    if (!user) return reply.code(204).send()

    // Clean up expired tokens for this user before inserting a new one
    await db.delete(magicLinks)
      .where(and(eq(magicLinks.userId, user.id), lt(magicLinks.expiresAt, new Date())))

    const rawToken = generateToken()
    const tokenHash = sha256hex(rawToken)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await db.insert(magicLinks).values({ userId: user.id, tokenHash, expiresAt })

    const magicLinkUrl = `${config.APP_URL}/magic-link/verify?token=${rawToken}`

    try {
      await sendEmail({
        to: user.email,
        subject: 'Your sign-in link',
        text: `Hi ${user.displayName},\n\nClick the link below to sign in to your account:\n\n${magicLinkUrl}\n\nThis link expires in 15 minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `<p>Hi ${user.displayName},</p><p>Click the link below to sign in to your account:</p><p><a href="${magicLinkUrl}">${magicLinkUrl}</a></p><p>This link expires in 15 minutes and can only be used once.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
      })
    } catch {
      // SMTP not configured or failed — log server-side, return 204 anyway
      fastify.log.warn({ email: '[redacted]' }, 'Magic link email could not be sent (SMTP not configured or failed)')
    }

    return reply.code(204).send()
  })

  fastify.post('/api/auth/magic-link/verify', async (request, reply) => {
    const body = MagicLinkVerifySchema.parse(request.body)
    const tokenHash = sha256hex(body.token)

    const [link] = await db
      .select({ id: magicLinks.id, userId: magicLinks.userId, used: magicLinks.used, expiresAt: magicLinks.expiresAt })
      .from(magicLinks)
      .where(eq(magicLinks.tokenHash, tokenHash))
      .limit(1)

    if (!link || link.used || link.expiresAt < new Date()) {
      throw createError(401, 'INVALID_OR_EXPIRED_TOKEN', 'This link is invalid or has expired.')
    }

    // Mark as used immediately to prevent replay
    await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.id, link.id))

    const [user] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
      .from(users)
      .where(eq(users.id, link.userId))
      .limit(1)

    if (!user) throw createError(401, 'INVALID_OR_EXPIRED_TOKEN', 'This link is invalid or has expired.')

    // Merge visitor session into the account
    if (request.session) {
      request.session.userId = user.id
      await mergeSessionIntoUser(request.session.id, user.id)
    }

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

    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } }
  })
}

export default authRoutes
