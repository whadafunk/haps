import { pgTable, uuid, text, boolean, timestamp, jsonb, integer, unique, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id:              uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email:           text('email').notNull().unique(),
  passwordHash:    text('password_hash').notNull(),
  displayName:     text('display_name').notNull(),
  role:            text('role').notNull(), // 'admin' | 'organizer'
  avatarUrl:       text('avatar_url'),
  phone:           text('phone'),
  instagramHandle: text('instagram_handle'),
  subscribed:      boolean('subscribed').notNull().default(false),
  active:          boolean('active').notNull().default(true),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const guests = pgTable('guests', {
  id:              uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:            text('name').notNull(),
  email:           text('email').notNull().unique(),
  phone:           text('phone'),
  instagramHandle: text('instagram_handle'),
  notes:           text('notes'),
  avatarUrl:       text('avatar_url'),
  bio:             text('bio'),
  vibe:            text('vibe'),
  passwordHash:    text('password_hash'),
  claimedAt:       timestamp('claimed_at', { withTimezone: true }),
  userId:          uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status:          text('status').notNull().default('active'),
  statusReason:    text('status_reason'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx:  index('guests_email_idx').on(t.email),
  userIdx:   uniqueIndex('guests_user_id_unique_idx').on(t.userId).where(sql`${t.userId} is not null`),
}))

export const visitorSessions = pgTable('visitor_sessions', {
  id:              uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:          uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  guestId:         uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
  displayName:     text('display_name'),
  email:           text('email'),
  phone:           text('phone'),
  instagramHandle: text('instagram_handle'),
  eventAccess:      jsonb('event_access').notNull().default(sql`'{}'::jsonb`),
  messagingOptOut:  boolean('messaging_opt_out').notNull().default(false),
  status:           text('status').notNull().default('active'), // 'active' | 'blocked' | 'removed'
  statusReason:    text('status_reason'),
  statusAt:        timestamp('status_at', { withTimezone: true }),
  statusBy:        uuid('status_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:      timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx:   index('visitor_sessions_user_idx').on(t.userId).where(sql`${t.userId} is not null`),
  guestIdx:  index('visitor_sessions_guest_idx').on(t.guestId).where(sql`${t.guestId} is not null`),
  statusIdx: index('visitor_sessions_status_idx').on(t.status).where(sql`${t.status} != 'active'`),
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
  showGuests:          boolean('show_guests').notNull().default(true),
  showAlbum:           boolean('show_album').notNull().default(true),
  guestsRequireRsvp:   boolean('guests_require_rsvp').notNull().default(false),
  wallRequiresRsvp:    boolean('wall_requires_rsvp').notNull().default(false),
  coordinates:   text('coordinates'),
  dressCode:     text('dress_code'),
  allowPlusOnes: boolean('allow_plus_ones').notNull().default(false),
  maxPlusOnes:   integer('max_plus_ones'),
  maxCapacity:   integer('max_capacity'),
  rsvpDeadline:  timestamp('rsvp_deadline', { withTimezone: true }),
  expiresAt:     timestamp('expires_at', { withTimezone: true }),
  eventType:      text('event_type').notNull().default('open'), // 'open' | 'invite_only'
  moderatePosts:  boolean('moderate_posts').notNull().default(false),
  welcomeMessage: text('welcome_message'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx:         index('events_slug_idx').on(t.slug),
  organizerIdx:    index('events_organizer_idx').on(t.organizerId),
  statusStartsIdx: index('events_status_starts_idx').on(t.status, t.startsAt),
  expiresIdx:      index('events_expires_idx').on(t.expiresAt).where(sql`${t.expiresAt} is not null`),
}))

export const eventTokens = pgTable('event_tokens', {
  id:                   uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:              uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  type:                 text('type').notNull(), // 'edit' | 'attendee'
  tokenHash:            text('token_hash').notNull(),
  label:                text('label'),
  status:               text('status').notNull().default('active'), // 'active' | 'blocked' | 'blacklisted'
  singleUse:            boolean('single_use').notNull().default(false),
  inviteUrl:            text('invite_url'),  // raw URL for attendee tokens; null for edit tokens
  claimedBySessionId:   uuid('claimed_by_session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  guestId:              uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventTypeIdx:  index('event_tokens_event_type_idx').on(t.eventId, t.type).where(sql`${t.status} = 'active'`),
  guestIdx:      index('event_tokens_guest_idx').on(t.guestId).where(sql`${t.guestId} is not null`),
}))

export const rsvps = pgTable('rsvps', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:     uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  guestId:     uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
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
  uniqueEventSession:  unique().on(t.eventId, t.sessionId),
  uniqueEventUser:     unique().on(t.eventId, t.userId),
  uniqueEventGuest:    uniqueIndex('rsvps_event_guest_idx').on(t.eventId, t.guestId).where(sql`${t.guestId} is not null`),
  eventStatusIdx:      index('rsvps_event_status_idx').on(t.eventId, t.status),
  sessionIdx:          index('rsvps_session_idx').on(t.sessionId),
  userIdx:             index('rsvps_user_idx').on(t.userId),
  guestIdx:            index('rsvps_guest_idx').on(t.guestId).where(sql`${t.guestId} is not null`),
}))

export const emailBlocklist = pgTable('email_blocklist', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email:     text('email').notNull().unique(),
  permanent: boolean('permanent').notNull().default(false),
  reason:    text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
})

export const instanceConfig = pgTable('instance_config', {
  id:           text('id').primaryKey(), // always 'singleton'
  instanceName: text('instance_name').notNull().default('Haps'),
  smtpHost:     text('smtp_host'),
  smtpPort:     integer('smtp_port').notNull().default(587),
  smtpUser:     text('smtp_user'),
  smtpPass:     text('smtp_pass'),
  smtpFrom:     text('smtp_from'),
  defaultTheme:                 text('default_theme'),
  requireRsvpBeforeRegister:    boolean('require_rsvp_before_register').notNull().default(true),
  vapidPublicKey:               text('vapid_public_key'),
  vapidPrivateKey:              text('vapid_private_key'),
  updatedAt:                    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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

export const notifications = pgTable('notifications', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId:  uuid('session_id').references(() => visitorSessions.id, { onDelete: 'cascade' }),
  userId:     uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  eventId:    uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  type:       text('type').notNull(), // 'announcement' | 'reminder' | 'waitlist_promotion' | 'event_cancelled' | 'event_rescheduled' | 'welcome'
  senderName: text('sender_name'),   // organizer display name; null for system messages
  subject:    text('subject'),       // subject line; null for system messages without one
  body:       text('body').notNull(),
  link:       text('link'),
  read:       boolean('read').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index('notifications_session_idx').on(t.sessionId).where(sql`${t.sessionId} is not null`),
  userIdx:    index('notifications_user_idx').on(t.userId).where(sql`${t.userId} is not null`),
}))

export const magicLinks = pgTable('magic_links', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(), // SHA-256 hex
  used:      boolean('used').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const albumPhotos = pgTable('album_photos', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:      uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sessionId:    uuid('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  userId:       uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  uploaderName: text('uploader_name').notNull(),
  url:          text('url').notNull(),
  caption:      text('caption'),
  deletedAt:    timestamp('deleted_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventIdx: index('album_photos_event_idx').on(t.eventId),
}))

export const posts = pgTable('posts', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:    uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sessionId:  uuid('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  userId:     uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  body:       text('body'),
  status:     text('status').notNull().default('approved'), // 'pending' | 'approved'
  deletedAt:  timestamp('deleted_at', { withTimezone: true }),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventCreatedIdx: index('posts_event_created_idx').on(t.eventId, t.createdAt).where(sql`${t.deletedAt} is null`),
}))

export const postPhotos = pgTable('post_photos', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  postId:    uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  photoId:   uuid('photo_id').notNull().references(() => albumPhotos.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const postReactions = pgTable('post_reactions', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  postId:    uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => visitorSessions.id, { onDelete: 'cascade' }),
  guestId:   uuid('guest_id').references(() => guests.id, { onDelete: 'cascade' }),
  emoji:     text('emoji').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionEmojiIdx: uniqueIndex('post_reactions_session_emoji_idx').on(t.postId, t.sessionId, t.emoji).where(sql`${t.sessionId} is not null`),
  guestEmojiIdx:   uniqueIndex('post_reactions_guest_emoji_idx').on(t.postId, t.guestId, t.emoji).where(sql`${t.guestId} is not null`),
}))

export const pushSubscriptions = pgTable('push_subscriptions', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid('session_id').notNull().references(() => visitorSessions.id, { onDelete: 'cascade' }),
  endpoint:  text('endpoint').notNull(),
  p256dh:    text('p256dh').notNull(),
  authKey:   text('auth_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index('push_subscriptions_session_idx').on(t.sessionId),
  uniqueEndpoint: unique('push_subscriptions_session_endpoint_unique').on(t.sessionId, t.endpoint),
}))

export const guestSignals = pgTable('guest_signals', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  fromSessionId: uuid('from_session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  fromGuestId:   uuid('from_guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  toGuestId:     uuid('to_guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  eventId:       uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  type:          text('type').notNull(), // 'wink' | 'crush'
  revealed:      boolean('revealed').notNull().default(false),
  eventContext:  text('event_context'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  fromGuestIdx:  index('guest_signals_from_guest_idx').on(t.fromGuestId),
  toGuestIdx:    index('guest_signals_to_guest_idx').on(t.toGuestId),
  eventIdx:      index('guest_signals_event_idx').on(t.eventId),
  uniquePair:    unique('guest_signals_pair_unique').on(t.fromGuestId, t.toGuestId, t.eventId, t.type),
}))

export const directMessages = pgTable('direct_messages', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:       uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  fromGuestId:   uuid('from_guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  toGuestId:     uuid('to_guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  fromSessionId: uuid('from_session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  body:          text('body').notNull(),
  readAt:        timestamp('read_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  threadIdx:    index('dm_thread_idx').on(t.eventId, t.fromGuestId, t.toGuestId),
  inboxIdx:     index('dm_inbox_idx').on(t.toGuestId, t.eventId),
}))

export const guestBlocks = pgTable('guest_blocks', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:          uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  blockingGuestId:  uuid('blocking_guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  blockedGuestId:   uuid('blocked_guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueBlock: unique('guest_blocks_unique').on(t.eventId, t.blockingGuestId, t.blockedGuestId),
}))

