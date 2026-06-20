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
  organizerName?: string | null
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
  showAlbum: boolean
  guestsRequireRsvp: boolean
  wallRequiresRsvp: boolean
  allowPlusOnes: boolean
  maxPlusOnes?: number | null
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

export interface AlbumPhoto {
  id: string
  eventId: string
  uploaderName: string
  url: string
  caption?: string | null
  createdAt: string
}

export interface Post {
  id: string
  eventId: string
  authorName: string
  body?: string | null
  photos: Array<{ id: string; url: string; caption?: string | null }>
  createdAt: string
  guestId?: string | null
  isOwn?: boolean
}

export interface VisitorSession {
  id: string
  displayName?: string | null
  email?: string | null
  eventAccess: Record<string, 'attendee' | 'editor'>
}
