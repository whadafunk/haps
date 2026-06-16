-- Add password_hash to contacts before rename
ALTER TABLE "contacts" ADD COLUMN "password_hash" text;

-- Copy password_hash from member users to their contact entries
UPDATE "contacts" c
SET "password_hash" = u."password_hash"
FROM "users" u
WHERE c."user_id" = u."id" AND u."role" = 'member';

-- Rename contacts → guests
ALTER TABLE "contacts" RENAME TO "guests";

-- Add guest_id to visitor_sessions
ALTER TABLE "visitor_sessions" ADD COLUMN "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL;
CREATE INDEX "visitor_sessions_guest_idx" ON "visitor_sessions"("guest_id") WHERE "guest_id" IS NOT NULL;

-- For sessions owned by member users, set guest_id and clear user_id
UPDATE "visitor_sessions" vs
SET "guest_id" = g."id", "user_id" = NULL
FROM "guests" g
JOIN "users" u ON u."id" = g."user_id"
WHERE vs."user_id" = u."id" AND u."role" = 'member';

-- Rename contact_id → guest_id in rsvps
ALTER TABLE "rsvps" RENAME COLUMN "contact_id" TO "guest_id";
DROP INDEX IF EXISTS "rsvps_event_contact_idx";
DROP INDEX IF EXISTS "rsvps_contact_idx";
CREATE UNIQUE INDEX "rsvps_event_guest_idx" ON "rsvps"("event_id", "guest_id") WHERE "guest_id" IS NOT NULL;
CREATE INDEX "rsvps_guest_idx" ON "rsvps"("guest_id") WHERE "guest_id" IS NOT NULL;

-- Rename contact_id → guest_id in event_tokens
ALTER TABLE "event_tokens" RENAME COLUMN "contact_id" TO "guest_id";

-- Delete member users (their auth is now in guests.password_hash)
DELETE FROM "users" WHERE "role" = 'member';
