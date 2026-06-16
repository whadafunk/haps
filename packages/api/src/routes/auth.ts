import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { users, guests, visitorSessions, rsvps, comments, magicLinks, instanceConfig } from '../db/schema.js'
import { eq, and, lt, count } from 'drizzle-orm'
import { verifyPassword, hashPassword, generateToken, sha256hex } from '../lib/crypto.js'
import { signJwt, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js'
import { createError } from '../lib/errors.js'
import { LoginSchema, CreateUserSchema, UpdateProfileSchema, ChangePasswordSchema, RegisterSchema, MagicLinkRequestSchema, MagicLinkVerifySchema, SetupContactSchema } from '@haps/shared'
import { config } from '../lib/config.js'
import { sendEmail } from '../services/email.js'

/** Atomically claim a visitor session's RSVPs and comments into a guest account. */
async function mergeSessionIntoGuest(sessionId: string, guestId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const sessionRsvps = await tx
      .select({ id: rsvps.id, eventId: rsvps.eventId, guestId: rsvps.guestId })
      .from(rsvps)
      .where(eq(rsvps.sessionId, sessionId))

    for (const rsvp of sessionRsvps) {
      // If this RSVP already has guestId set (was created while anonymous with email lookup),
      // just clear the sessionId — no conflict possible with itself
      if (rsvp.guestId === guestId) {
        await tx.update(rsvps)
          .set({ sessionId: null })
          .where(eq(rsvps.id, rsvp.id))
        continue
      }

      // Check for a distinct RSVP with the same guestId for this event
      const [conflict] = await tx
        .select({ id: rsvps.id })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, rsvp.eventId), eq(rsvps.guestId, guestId)))
        .limit(1)

      if (conflict) {
        // Another RSVP for this guest on this event already exists — discard the session one
        await tx.delete(rsvps).where(eq(rsvps.id, rsvp.id))
      } else {
        await tx.update(rsvps)
          .set({ guestId, sessionId: null })
          .where(eq(rsvps.id, rsvp.id))
      }
    }

    await tx.update(comments)
      .set({ userId: null, sessionId: null })
      .where(eq(comments.sessionId, sessionId))

    await tx.update(visitorSessions)
      .set({ guestId })
      .where(eq(visitorSessions.id, sessionId))
  })
}

/** Atomically claim a visitor session's RSVPs, comments, and event_access into a user account (operators). */
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

    // 1. Check operators (admin/organizer) first
    const [operatorUser] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, passwordHash: users.passwordHash, active: users.active })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1)

    if (operatorUser) {
      const valid = await verifyPassword(operatorUser.passwordHash, body.password)
      if (!valid) throw createError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
      if (!operatorUser.active) throw createError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated.')

      const payload = { sub: operatorUser.id, type: 'operator' as const, role: operatorUser.role as 'admin' | 'organizer' }
      const accessToken = signJwt(payload)
      const refreshToken = signRefreshToken(operatorUser.id)

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
          const freshSessions = await db.insert(visitorSessions)
            .values({ userId: operatorUser.id })
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
          request.session.userId = operatorUser.id
          await mergeSessionIntoUser(request.session.id, operatorUser.id)
        }
      }

      return { user: { id: operatorUser.id, email: operatorUser.email, displayName: operatorUser.displayName, role: operatorUser.role, type: 'operator' } }
    }

    // 2. Check claimed guests
    const [guestUser] = await db
      .select({ id: guests.id, email: guests.email, name: guests.name, passwordHash: guests.passwordHash })
      .from(guests)
      .where(and(eq(guests.email, body.email), eq(guests.status, 'active')))
      .limit(1)

    if (!guestUser || !guestUser.passwordHash) {
      throw createError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    }

    const guestValid = await verifyPassword(guestUser.passwordHash, body.password)
    if (!guestValid) throw createError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')

    const guestPayload = { sub: guestUser.id, type: 'guest' as const }
    const guestAccessToken = signJwt(guestPayload)
    const guestRefreshToken = signRefreshToken(guestUser.id)

    reply.setCookie('auth_token', guestAccessToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60,
    })
    reply.setCookie('refresh_token', guestRefreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 60 * 60 * 24 * 7,
    })

    // Merge session RSVPs into guest account (handles duplicate events by keeping guest's existing RSVP)
    if (request.session) {
      await mergeSessionIntoGuest(request.session.id, guestUser.id)
      request.session.guestId = guestUser.id
    }

    return { user: { id: guestUser.id, email: guestUser.email, displayName: guestUser.name, role: null, type: 'guest' } }
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

    // Guard: require at least one RSVP before registering (configurable in admin settings)
    const [cfg] = await db.select({ requireRsvpBeforeRegister: instanceConfig.requireRsvpBeforeRegister }).from(instanceConfig).limit(1)
    const guardEnabled = cfg?.requireRsvpBeforeRegister ?? true
    if (guardEnabled) {
      const [guestForEmail] = await db
        .select({ id: guests.id })
        .from(guests)
        .where(eq(guests.email, body.email.toLowerCase()))
        .limit(1)
      if (!guestForEmail) {
        throw createError(403, 'NO_EVENT_HISTORY', 'RSVP to at least one event before creating an account.')
      }
      const [countRow] = await db
        .select({ n: count() })
        .from(rsvps)
        .where(eq(rsvps.guestId, guestForEmail.id))
      if (Number(countRow?.n ?? 0) === 0) {
        throw createError(403, 'NO_EVENT_HISTORY', 'RSVP to at least one event before creating an account.')
      }
    }

    // Check if email is already claimed (guest with password_hash set)
    const [existingGuest] = await db
      .select({ id: guests.id, passwordHash: guests.passwordHash })
      .from(guests)
      .where(eq(guests.email, body.email.toLowerCase()))
      .limit(1)

    if (existingGuest?.passwordHash) {
      throw createError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.')
    }

    const passwordHash = await hashPassword(body.password)

    let guestId: string
    const now = new Date()
    if (existingGuest) {
      // Claim existing guest entry
      await db.update(guests)
        .set({ passwordHash, name: body.displayName, claimedAt: now, updatedAt: now })
        .where(eq(guests.id, existingGuest.id))
      guestId = existingGuest.id
    } else {
      // Create new guest entry
      const [newGuest] = await db.insert(guests)
        .values({ name: body.displayName, email: body.email.toLowerCase(), passwordHash, claimedAt: now })
        .returning({ id: guests.id })
      if (!newGuest) throw createError(500, 'INTERNAL_ERROR', 'Failed to create account.')
      guestId = newGuest.id
    }

    // Merge current visitor session RSVPs/comments into this guest account
    if (request.session) {
      await mergeSessionIntoGuest(request.session.id, guestId)
      request.session.guestId = guestId
      request.session.userId = null
    }

    const payload = { sub: guestId, type: 'guest' as const }
    const accessToken = signJwt(payload)
    const refreshToken = signRefreshToken(guestId)

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

    const [guestRow] = await db.select({ id: guests.id, email: guests.email, name: guests.name })
      .from(guests).where(eq(guests.id, guestId)).limit(1)

    return reply.code(201).send({ user: { id: guestId, email: guestRow?.email ?? body.email, displayName: guestRow?.name ?? body.displayName, role: null, type: 'guest' } })
  })

  fastify.post('/api/auth/refresh', async (request, reply) => {
    const rawRefresh = request.cookies.refresh_token
    if (!rawRefresh) throw createError(401, 'TOKEN_EXPIRED', 'Refresh token missing.')

    const payload = verifyRefreshToken(rawRefresh)
    if (!payload) throw createError(401, 'TOKEN_EXPIRED', 'Refresh token expired.')

    // Try operator first
    const [operatorUser] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1)

    if (operatorUser) {
      const accessToken = signJwt({ sub: operatorUser.id, type: 'operator', role: operatorUser.role as 'admin' | 'organizer' })
      reply.setCookie('auth_token', accessToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60,
      })
      return reply.code(200).send()
    }

    // Try guest
    const [guestUser] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.id, payload.sub))
      .limit(1)

    if (!guestUser) throw createError(401, 'TOKEN_EXPIRED', 'Account not found.')

    const accessToken = signJwt({ sub: guestUser.id, type: 'guest' })
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

    if (user.type === 'guest') {
      const [row] = await db
        .select({ id: guests.id, email: guests.email, name: guests.name })
        .from(guests)
        .where(eq(guests.id, user.sub))
        .limit(1)
      if (!row) throw createError(401, 'UNAUTHORIZED', 'Guest not found.')
      return { id: row.id, email: row.email, displayName: row.name, role: null, type: 'guest' }
    }

    // Operator
    const [row] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, subscribed: users.subscribed })
      .from(users)
      .where(eq(users.id, user.sub))
      .limit(1)
    if (!row) throw createError(401, 'UNAUTHORIZED', 'User not found.')
    return { id: row.id, email: row.email, displayName: row.displayName, role: row.role, subscribed: row.subscribed, type: 'operator' }
  })

  fastify.patch('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = request.user!
    const body = UpdateProfileSchema.parse(request.body)

    if (user.type === 'guest') {
      const [updated] = await db
        .update(guests)
        .set({ name: body.displayName, updatedAt: new Date() })
        .where(eq(guests.id, user.sub))
        .returning({ id: guests.id, email: guests.email, name: guests.name })
      if (!updated) throw createError(404, 'USER_NOT_FOUND', 'Guest not found.')
      return { user: { id: updated.id, email: updated.email, displayName: updated.name, role: null, type: 'guest' } }
    }

    // Operator
    const [updated] = await db
      .update(users)
      .set({ displayName: body.displayName, updatedAt: new Date() })
      .where(eq(users.id, user.sub))
      .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })

    if (!updated) throw createError(404, 'USER_NOT_FOUND', 'User not found.')

    // Sync displayName change to the linked guest (if one exists)
    await db
      .update(guests)
      .set({ name: body.displayName, updatedAt: new Date() })
      .where(eq(guests.userId, user.sub))

    return { user: { ...updated, type: 'operator' } }
  })

  fastify.get('/api/auth/me/guest', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = request.user!

    if (user.type === 'guest') {
      // Guest IS their own record
      const [guest] = await db
        .select({
          id:              guests.id,
          name:            guests.name,
          email:           guests.email,
          phone:           guests.phone,
          instagramHandle: guests.instagramHandle,
        })
        .from(guests)
        .where(eq(guests.id, user.sub))
        .limit(1)
      if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')
      return { contact: guest }
    }

    // Operator: look up their linked guest entry
    const [guest] = await db
      .select({
        id:              guests.id,
        name:            guests.name,
        email:           guests.email,
        phone:           guests.phone,
        instagramHandle: guests.instagramHandle,
      })
      .from(guests)
      .where(eq(guests.userId, user.sub))
      .limit(1)
    if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'No guest identity linked yet.')
    return { contact: guest }
  })

  // Keep old endpoint as alias
  fastify.get('/api/auth/me/contact', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // Delegate to the new endpoint handler by re-using the same logic
    const user = request.user!

    if (user.type === 'guest') {
      const [guest] = await db
        .select({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone, instagramHandle: guests.instagramHandle })
        .from(guests).where(eq(guests.id, user.sub)).limit(1)
      if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'Guest not found.')
      return reply.send({ contact: guest })
    }

    const [guest] = await db
      .select({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone, instagramHandle: guests.instagramHandle })
      .from(guests).where(eq(guests.userId, user.sub)).limit(1)
    if (!guest) throw createError(404, 'GUEST_NOT_FOUND', 'No guest identity linked yet.')
    return reply.send({ contact: guest })
  })

  fastify.post('/api/auth/me/guest', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = request.user!
    const body = SetupContactSchema.parse(request.body)

    if (user.type === 'guest') {
      // Guest updates their own record
      const [emailConflict] = await db
        .select({ id: guests.id })
        .from(guests)
        .where(eq(guests.email, body.email.toLowerCase()))
        .limit(1)
      if (emailConflict && emailConflict.id !== user.sub) {
        throw createError(409, 'EMAIL_TAKEN', 'This email is already linked to another account.')
      }

      const [updated] = await db.update(guests)
        .set({
          name:            body.displayName,
          email:           body.email.toLowerCase(),
          phone:           body.phone ?? null,
          instagramHandle: body.instagramHandle ?? null,
          updatedAt:       new Date(),
        })
        .where(eq(guests.id, user.sub))
        .returning({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone, instagramHandle: guests.instagramHandle })
      if (!updated) throw createError(500, 'INTERNAL_ERROR', 'Failed to update guest.')
      return { contact: updated }
    }

    // Operator: upsert their linked guest entry
    const [emailConflict] = await db
      .select({ id: guests.id, userId: guests.userId })
      .from(guests)
      .where(eq(guests.email, body.email.toLowerCase()))
      .limit(1)
    if (emailConflict && emailConflict.userId !== user.sub) {
      throw createError(409, 'EMAIL_TAKEN', 'This email is already linked to another account.')
    }

    const [guest] = await db.insert(guests)
      .values({
        name:            body.displayName,
        email:           body.email.toLowerCase(),
        phone:           body.phone ?? null,
        instagramHandle: body.instagramHandle ?? null,
        userId:          user.sub,
      })
      .onConflictDoUpdate({
        target: guests.email,
        set: {
          name:            body.displayName,
          userId:          user.sub,
          phone:           body.phone ?? null,
          instagramHandle: body.instagramHandle ?? null,
          updatedAt:       new Date(),
        },
      })
      .returning({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone, instagramHandle: guests.instagramHandle })
    if (!guest) throw createError(500, 'INTERNAL_ERROR', 'Failed to upsert guest.')

    // Sync displayName to user
    await db.update(users)
      .set({ displayName: body.displayName, updatedAt: new Date() })
      .where(eq(users.id, user.sub))

    return { contact: guest }
  })

  // Keep old endpoint as alias
  fastify.post('/api/auth/me/contact', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!
    const body = SetupContactSchema.parse(request.body)

    if (user.type === 'guest') {
      const [emailConflict] = await db.select({ id: guests.id }).from(guests).where(eq(guests.email, body.email.toLowerCase())).limit(1)
      if (emailConflict && emailConflict.id !== user.sub) throw createError(409, 'EMAIL_TAKEN', 'This email is already linked to another account.')
      const [updated] = await db.update(guests).set({ name: body.displayName, email: body.email.toLowerCase(), phone: body.phone ?? null, instagramHandle: body.instagramHandle ?? null, updatedAt: new Date() }).where(eq(guests.id, user.sub)).returning({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone, instagramHandle: guests.instagramHandle })
      if (!updated) throw createError(500, 'INTERNAL_ERROR', 'Failed to update guest.')
      return reply.send({ contact: updated })
    }

    const [emailConflict] = await db.select({ id: guests.id, userId: guests.userId }).from(guests).where(eq(guests.email, body.email.toLowerCase())).limit(1)
    if (emailConflict && emailConflict.userId !== user.sub) throw createError(409, 'EMAIL_TAKEN', 'This email is already linked to another account.')

    const [guest] = await db.insert(guests).values({ name: body.displayName, email: body.email.toLowerCase(), phone: body.phone ?? null, instagramHandle: body.instagramHandle ?? null, userId: user.sub })
      .onConflictDoUpdate({ target: guests.email, set: { name: body.displayName, userId: user.sub, phone: body.phone ?? null, instagramHandle: body.instagramHandle ?? null, updatedAt: new Date() } })
      .returning({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone, instagramHandle: guests.instagramHandle })
    if (!guest) throw createError(500, 'INTERNAL_ERROR', 'Failed to upsert guest.')
    await db.update(users).set({ displayName: body.displayName, updatedAt: new Date() }).where(eq(users.id, user.sub))
    return reply.send({ contact: guest })
  })

  fastify.post('/api/auth/change-password', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!
    const body = ChangePasswordSchema.parse(request.body)

    if (user.type === 'guest') {
      const [row] = await db
        .select({ id: guests.id, passwordHash: guests.passwordHash })
        .from(guests)
        .where(eq(guests.id, user.sub))
        .limit(1)

      if (!row || !row.passwordHash) throw createError(404, 'USER_NOT_FOUND', 'Guest not found.')

      const valid = await verifyPassword(row.passwordHash, body.currentPassword)
      if (!valid) throw createError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.')

      const newHash = await hashPassword(body.newPassword)
      await db.update(guests).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(guests.id, user.sub))
      return reply.code(204).send()
    }

    // Operator
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

    if (user.type === 'guest') {
      // Unclaim: clear auth fields but preserve guest entry (has RSVP history)
      await db.update(guests)
        .set({ passwordHash: null, claimedAt: null, updatedAt: new Date() })
        .where(eq(guests.id, user.sub))

      reply.clearCookie('auth_token', { path: '/' })
      reply.clearCookie('refresh_token', { path: '/api/auth' })
      return reply.code(204).send()
    }

    // Operator
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

    await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.id, link.id))

    const [user] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
      .from(users)
      .where(eq(users.id, link.userId))
      .limit(1)

    if (!user) throw createError(401, 'INVALID_OR_EXPIRED_TOKEN', 'This link is invalid or has expired.')

    if (request.session) {
      request.session.userId = user.id
      await mergeSessionIntoUser(request.session.id, user.id)
    }

    const payload = { sub: user.id, type: 'operator' as const, role: user.role as 'admin' | 'organizer' }
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

    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, type: 'operator' } }
  })
}

export default authRoutes
