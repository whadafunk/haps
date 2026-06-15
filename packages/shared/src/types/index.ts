export interface User {
  id: string
  email: string
  displayName: string
  role: 'admin' | 'organizer' | 'member'
  avatarUrl?: string | null
  subscribed: boolean
  createdAt: string
}

export interface Event {
  id: string
  slug: string
  organizerId: string
  title: string
  description?: string | null
  location?: string | null
  startsAt: string
  endsAt?: string | null
  timezone: string
  coverImageUrl?: string | null
  theme?: string | null
  status: 'draft' | 'published' | 'cancelled' | 'archived'
  eventType: 'open' | 'invite_only'
  showGuests: boolean
  allowComments: boolean
  maxCapacity?: number | null
  rsvpDeadline?: string | null
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface EventToken {
  id: string
  eventId: string
  type: 'edit' | 'attendee'
  label?: string | null
  revoked: boolean
  createdAt: string
}

export interface Rsvp {
  id: string
  eventId: string
  sessionId?: string | null
  userId?: string | null
  displayName: string
  email?: string | null
  status: 'yes' | 'maybe' | 'no' | 'waitlist'
  headCount: number
  note?: string | null
  checkedIn: boolean
  checkedInAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  eventId: string
  displayName: string
  body: string
  createdAt: string
}

export interface VisitorSession {
  id: string
  displayName?: string | null
  email?: string | null
  eventAccess: Record<string, 'attendee' | 'editor'>
}
