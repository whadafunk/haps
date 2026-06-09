import { pgTable, uuid, text, boolean, timestamp, jsonb, integer, unique, index } from 'drizzle-orm/pg-core'
import { sql, isNull, eq } from 'drizzle-orm'

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName:  text('display_name').notNull(),
  role:         text('role').notNull(), // 'admin' | 'organizer' | 'member'
  avatarUrl:    text('avatar_url'),
  subscribed:   boolean('subscribed').notNull().default(false),
  active:       boolean('active').notNull().default(true),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const visitorSessions = pgTable('visitor_sessions', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:      uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name'),
  email:       text('email'),
  eventAccess: jsonb('event_access').notNull().default(sql`'{}'::jsonb`),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:  timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('visitor_sessions_user_idx').on(t.userId).where(sql`${t.userId} is not null`),
}))

export const events = pgTable('events', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug:          text('slug').notNull().unique(),
  organizerId:   uuid('organizer_id').notNull().references(() => users.id),
  title:         text('title').notNull(),
  description:   text('description'),
  location:      text('location'),
  startsAt:      timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt:        timestamp('ends_at', { withTimezone: true }),
  timezone:      text('timezone').notNull(),
  coverImageUrl: text('cover_image_url'),
  theme:         text('theme'),
  status:        text('status').notNull().default('draft'), // 'draft'|'published'|'cancelled'|'archived'
  showGuests:    boolean('show_guests').notNull().default(true),
  allowComments: boolean('allow_comments').notNull().default(true),
  maxCapacity:   integer('max_capacity'),
  rsvpDeadline:  timestamp('rsvp_deadline', { withTimezone: true }),
  expiresAt:     timestamp('expires_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx:         index('events_slug_idx').on(t.slug),
  organizerIdx:    index('events_organizer_idx').on(t.organizerId),
  statusStartsIdx: index('events_status_starts_idx').on(t.status, t.startsAt),
  expiresIdx:      index('events_expires_idx').on(t.expiresAt).where(sql`${t.expiresAt} is not null`),
}))

export const eventTokens = pgTable('event_tokens', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:   uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  type:      text('type').notNull(), // 'edit' | 'attendee'
  tokenHash: text('token_hash').notNull(),
  label:     text('label'),
  revoked:   boolean('revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventTypeIdx: index('event_tokens_event_type_idx').on(t.eventId, t.type).where(sql`${t.revoked} = false`),
}))

export const rsvps = pgTable('rsvps', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:     uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sessionId:   uuid('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  userId:      uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  tokenId:     uuid('token_id').references(() => eventTokens.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  email:       text('email'),
  status:      text('status').notNull(), // 'yes' | 'maybe' | 'no'
  headCount:   integer('head_count').notNull().default(1),
  note:        text('note'),
  checkedIn:   boolean('checked_in').notNull().default(false),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueEventSession: unique().on(t.eventId, t.sessionId),
  uniqueEventUser:    unique().on(t.eventId, t.userId),
  eventStatusIdx:     index('rsvps_event_status_idx').on(t.eventId, t.status),
  sessionIdx:         index('rsvps_session_idx').on(t.sessionId),
  userIdx:            index('rsvps_user_idx').on(t.userId),
}))

export const instanceConfig = pgTable('instance_config', {
  id:           text('id').primaryKey(), // always 'singleton'
  instanceName: text('instance_name').notNull().default('Haps'),
  smtpHost:     text('smtp_host'),
  smtpPort:     integer('smtp_port').notNull().default(587),
  smtpUser:     text('smtp_user'),
  smtpPass:     text('smtp_pass'),
  smtpFrom:     text('smtp_from'),
  defaultTheme: text('default_theme'),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const eventMessages = pgTable('event_messages', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:     uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sessionId:   uuid('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  userId:      uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  subject:     text('subject'), // only set for type='blast'
  body:        text('body').notNull(),
  type:        text('type').notNull().default('message'), // 'message' | 'blast' | 'system'
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventCreatedIdx: index('event_messages_event_created_idx').on(t.eventId, t.createdAt).where(sql`${t.deletedAt} is null`),
}))

export const deliveryJobs = pgTable('delivery_jobs', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventMessageId: uuid('event_message_id').notNull().references(() => eventMessages.id, { onDelete: 'cascade' }),
  channel:        text('channel').notNull(), // 'email' | 'sms'
  recipientEmail: text('recipient_email'),
  recipientPhone: text('recipient_phone'),
  recipientName:  text('recipient_name'),
  status:         text('status').notNull().default('pending'), // 'pending' | 'sent' | 'failed'
  attempts:       integer('attempts').notNull().default(0),
  lastAttemptAt:  timestamp('last_attempt_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pendingIdx: index('delivery_jobs_pending_idx').on(t.status, t.createdAt).where(sql`${t.status} = 'pending'`),
}))

export const comments = pgTable('comments', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:     uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sessionId:   uuid('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  userId:      uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  body:        text('body').notNull(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventCreatedIdx: index('comments_event_created_idx').on(t.eventId, t.createdAt).where(sql`${t.deletedAt} is null`),
}))
