import { db } from '../db/index.js'
import { deliveryJobs, eventMessages } from '../db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'
import { sendEmail } from '../services/email.js'

const MAX_ATTEMPTS = 3
const BATCH_SIZE = 50

export async function runDeliveryWorker(log: { info: (msg: string) => void; warn: (msg: string) => void; error: (err: unknown, msg: string) => void }): Promise<void> {
  const pending = await db
    .select({
      id: deliveryJobs.id,
      channel: deliveryJobs.channel,
      recipientEmail: deliveryJobs.recipientEmail,
      recipientName: deliveryJobs.recipientName,
      attempts: deliveryJobs.attempts,
      eventMessageId: deliveryJobs.eventMessageId,
    })
    .from(deliveryJobs)
    .where(eq(deliveryJobs.status, 'pending'))
    .orderBy(deliveryJobs.createdAt)
    .limit(BATCH_SIZE)

  if (pending.length === 0) return

  // Load all referenced messages in one query
  const messageIds = [...new Set(pending.map((j) => j.eventMessageId))]
  const messages = await db
    .select({ id: eventMessages.id, subject: eventMessages.subject, body: eventMessages.body })
    .from(eventMessages)
    .where(inArray(eventMessages.id, messageIds))

  const msgMap = new Map(messages.map((m) => [m.id, m]))

  for (const job of pending) {
    const msg = msgMap.get(job.eventMessageId)
    if (!msg) {
      await db.update(deliveryJobs)
        .set({ status: 'failed', lastAttemptAt: new Date() })
        .where(eq(deliveryJobs.id, job.id))
      continue
    }

    const newAttempts = job.attempts + 1

    try {
      if (job.channel === 'email') {
        if (!job.recipientEmail) throw new Error('No recipient email on job')
        await sendEmail({
          to: job.recipientEmail,
          subject: msg.subject ?? 'Update from the organizer',
          text: msg.body,
        })
      } else if (job.channel === 'sms') {
        // Twilio integration is Phase 2 — mark as failed immediately
        log.warn(`SMS delivery skipped for job ${job.id}: Twilio not yet configured`)
        await db.update(deliveryJobs)
          .set({ status: 'failed', attempts: newAttempts, lastAttemptAt: new Date() })
          .where(eq(deliveryJobs.id, job.id))
        continue
      }

      await db.update(deliveryJobs)
        .set({ status: 'sent', attempts: newAttempts, lastAttemptAt: new Date() })
        .where(eq(deliveryJobs.id, job.id))

      log.info(`Delivery job ${job.id} sent via ${job.channel}`)
    } catch (err) {
      const exhausted = newAttempts >= MAX_ATTEMPTS
      await db.update(deliveryJobs)
        .set({
          status: exhausted ? 'failed' : 'pending',
          attempts: newAttempts,
          lastAttemptAt: new Date(),
        })
        .where(eq(deliveryJobs.id, job.id))

      log.error(err, `Delivery job ${job.id} attempt ${newAttempts} failed${exhausted ? ' (giving up)' : ' (will retry)'}`)
    }
  }
}
