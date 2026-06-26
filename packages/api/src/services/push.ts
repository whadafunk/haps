import webpush from 'web-push'
import { db } from '../db/index.js'
import { instanceConfig, pushSubscriptions, visitorSessions } from '../db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'

export interface PushPayload {
  title: string
  body: string
  link?: string
  icon?: string
}

async function getOrCreateVapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  const [config] = await db
    .select({ vapidPublicKey: instanceConfig.vapidPublicKey, vapidPrivateKey: instanceConfig.vapidPrivateKey })
    .from(instanceConfig)
    .where(eq(instanceConfig.id, 'singleton'))
    .limit(1)

  if (config?.vapidPublicKey && config?.vapidPrivateKey) {
    return { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey }
  }

  const keys = webpush.generateVAPIDKeys()

  await db
    .update(instanceConfig)
    .set({ vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey })
    .where(eq(instanceConfig.id, 'singleton'))

  return { publicKey: keys.publicKey, privateKey: keys.privateKey }
}

export async function getVapidPublicKey(): Promise<string | null> {
  const keys = await getOrCreateVapidKeys()
  return keys?.publicKey ?? null
}

export async function sendPushToSession(
  sessionId: string | null,
  guestId: string | null,
  payload: PushPayload,
): Promise<void> {
  if (!sessionId && !guestId) return

  const keys = await getOrCreateVapidKeys()
  if (!keys) return

  webpush.setVapidDetails('mailto:admin@haps.app', keys.publicKey, keys.privateKey)

  // Find all session IDs to notify — current session + sibling sessions for claimed guests
  let sessionIds: string[] = sessionId ? [sessionId] : []

  if (guestId) {
    const siblings = await db
      .select({ id: visitorSessions.id })
      .from(visitorSessions)
      .where(eq(visitorSessions.guestId, guestId))
    sessionIds = [...new Set([...sessionIds, ...siblings.map(s => s.id)])]
  }

  if (sessionIds.length === 0) return

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.sessionId, sessionIds))

  if (subs.length === 0) return

  const data = JSON.stringify(payload)

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
          data,
        )
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired, remove it
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        }
      }
    })
  )
}

export async function sendBulkPush(sessionIds: string[], payload: PushPayload): Promise<number> {
  if (sessionIds.length === 0) return 0

  const keys = await getOrCreateVapidKeys()
  if (!keys) return 0

  webpush.setVapidDetails('mailto:admin@haps.app', keys.publicKey, keys.privateKey)

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.sessionId, sessionIds))

  if (subs.length === 0) return 0

  const data = JSON.stringify(payload)
  let sent = 0

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
          data,
        )
        sent++
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        }
      }
    })
  )

  return sent
}
