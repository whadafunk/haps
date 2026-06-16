import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import cron from 'node-cron'
import { config } from './lib/config.js'
import { errorHandler } from './middleware/errorHandler.js'
import sessionPlugin from './middleware/session.js'
import authPlugin from './middleware/auth.js'
import editTokenPlugin from './middleware/editToken.js'
import authRoutes from './routes/auth.js'
import eventsRoutes from './routes/events.js'
import rsvpsRoutes from './routes/rsvps.js'
import commentsRoutes from './routes/comments.js'
import postsRoutes from './routes/posts.js'
import albumRoutes from './routes/album.js'
import messagesRoutes from './routes/messages.js'
import sessionRoutes from './routes/session.js'
import adminRoutes from './routes/admin.js'
import setupRoutes from './routes/setup.js'
import uploadsRoutes from './routes/uploads.js'
import { migrate } from './db/migrate.js'
import { db } from './db/index.js'
import { events as eventsTable } from './db/schema.js'
import { and, isNotNull, lt } from 'drizzle-orm'
import { runDeliveryWorker } from './jobs/deliveryWorker.js'

export async function buildApp() {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'production'
        ? true
        : { transport: { target: 'pino-pretty', options: { colorize: true } } },
  })

  // Run migrations on startup
  await migrate()

  await app.register(cookie, { secret: config.SESSION_SECRET })

  if (!config.DISABLE_RATE_LIMIT) {
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  }

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

  app.setErrorHandler(errorHandler)

  // Plugins (order matters: session before auth so both populate request)
  await app.register(sessionPlugin)
  await app.register(authPlugin)
  await app.register(editTokenPlugin)

  // Routes
  await app.register(setupRoutes)
  await app.register(authRoutes)
  await app.register(eventsRoutes)
  await app.register(rsvpsRoutes)
  await app.register(commentsRoutes)
  await app.register(postsRoutes)
  await app.register(albumRoutes)
  await app.register(messagesRoutes)
  await app.register(sessionRoutes)
  await app.register(adminRoutes)
  await app.register(uploadsRoutes)

  app.get('/api/health', async () => ({ status: 'ok' }))

  // Expiry job: every hour delete events past their expiry date
  cron.schedule('0 * * * *', async () => {
    try {
      await db.delete(eventsTable).where(and(isNotNull(eventsTable.expiresAt), lt(eventsTable.expiresAt, new Date())))
      app.log.info('Expiry job: expired events cleaned up')
    } catch (err) {
      app.log.error(err, 'Expiry job failed')
    }
  })

  // Delivery worker: every 2 minutes process pending email/SMS delivery jobs
  cron.schedule('*/2 * * * *', async () => {
    try {
      await runDeliveryWorker(app.log)
    } catch (err) {
      app.log.error(err, 'Delivery worker failed')
    }
  })

  return app
}
