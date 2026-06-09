import nodemailer from 'nodemailer'
import { db } from '../db/index.js'
import { instanceConfig } from '../db/schema.js'
import { config } from '../lib/config.js'

interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const [row] = await db.select({
    smtpHost: instanceConfig.smtpHost,
    smtpPort: instanceConfig.smtpPort,
    smtpUser: instanceConfig.smtpUser,
    smtpPass: instanceConfig.smtpPass,
    smtpFrom: instanceConfig.smtpFrom,
  }).from(instanceConfig).limit(1)

  const host = row?.smtpHost ?? config.SMTP_HOST
  const user = row?.smtpUser ?? config.SMTP_USER
  const pass = row?.smtpPass ?? config.SMTP_PASS
  const from = row?.smtpFrom ?? config.SMTP_FROM
  const port = row?.smtpPort ?? config.SMTP_PORT

  if (!host || !user || !pass || !from) return null
  return { host, port, user, pass, from }
}

export async function sendEmail(opts: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const smtp = await getSmtpConfig()
  if (!smtp) throw new Error('SMTP is not configured.')

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  })

  await transporter.sendMail({
    from: smtp.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  })
}

export async function isSmtpConfigured(): Promise<boolean> {
  return (await getSmtpConfig()) !== null
}
