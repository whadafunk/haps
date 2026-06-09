import { z } from 'zod'

// Auth
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict()

// Events
export const CreateEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  location: z.string().max(500).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  timezone: z.string().min(1).max(100),
  theme: z.string().max(50).optional(),
  showGuests: z.boolean().default(true),
  allowComments: z.boolean().default(true),
  maxCapacity: z.number().int().positive().optional(),
  rsvpDeadline: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
}).strict()

export const UpdateEventSchema = CreateEventSchema.partial().extend({
  status: z.enum(['draft', 'published', 'cancelled', 'archived']).optional(),
}).strict()

// RSVPs
export const CreateRsvpSchema = z.object({
  displayName: z.string().min(1).max(200),
  status: z.enum(['yes', 'maybe', 'no']),
  headCount: z.number().int().positive().default(1),
  note: z.string().max(1000).optional(),
  email: z.string().email().optional(),
}).strict()

export const UpdateRsvpSchema = z.object({
  status: z.enum(['yes', 'maybe', 'no']).optional(),
  headCount: z.number().int().positive().optional(),
  note: z.string().max(1000).optional(),
}).strict()

// Comments
export const CreateCommentSchema = z.object({
  displayName: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
}).strict()

// Tokens
export const CreateTokenSchema = z.object({
  type: z.literal('attendee'),
  label: z.string().max(100).optional(),
}).strict()

// Session
export const UpdateSessionSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
}).strict()

// Admin config
export const UpdateConfigSchema = z.object({
  instanceName: z.string().max(200).optional(),
  logoUrl: z.string().url().optional(),
  defaultTheme: z.string().max(50).optional(),
  smtp: z.object({
    host: z.string().optional(),
    port: z.number().int().optional(),
    user: z.string().optional(),
    pass: z.string().optional(),
    from: z.string().optional(),
  }).optional(),
}).strict()

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(200),
  role: z.enum(['organizer', 'member']),
}).strict()

// Blast
export const BlastSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  channels: z.array(z.enum(['email', 'sms', 'push'])).min(1),
}).strict()
