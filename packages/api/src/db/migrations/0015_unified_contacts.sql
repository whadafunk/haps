-- Add user_id, status, status_reason to contacts
ALTER TABLE "contacts" ADD COLUMN "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "contacts" ADD COLUMN "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "contacts" ADD COLUMN "status_reason" text;

-- Claim contacts for existing users (upsert by email)
INSERT INTO "contacts" ("id", "name", "email", "user_id", "created_at", "updated_at")
SELECT gen_random_uuid(), "display_name", "email", "id", "created_at", now()
FROM "users"
ON CONFLICT ("email") DO UPDATE
  SET "user_id" = EXCLUDED."user_id", "updated_at" = now();

-- Create contacts for visitor sessions that have RSVPs and an email, not already in contacts
INSERT INTO "contacts" ("id", "name", "email", "created_at", "updated_at")
SELECT DISTINCT ON (vs."email")
  gen_random_uuid(),
  COALESCE(vs."display_name", (SELECT r."display_name" FROM "rsvps" r WHERE r."session_id" = vs."id" ORDER BY r."created_at" LIMIT 1), 'Guest'),
  vs."email",
  COALESCE((SELECT min(r."created_at") FROM "rsvps" r WHERE r."session_id" = vs."id"), now()),
  now()
FROM "visitor_sessions" vs
WHERE vs."email" IS NOT NULL AND vs."email" != ''
  AND EXISTS (SELECT 1 FROM "rsvps" r WHERE r."session_id" = vs."id")
ORDER BY vs."email", vs."created_at"
ON CONFLICT ("email") DO NOTHING;

-- Drop emailless contacts
DELETE FROM "contacts" WHERE "email" IS NULL OR "email" = '';

-- Make email NOT NULL
ALTER TABLE "contacts" ALTER COLUMN "email" SET NOT NULL;

-- Add contact_id to rsvps
ALTER TABLE "rsvps" ADD COLUMN "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL;

-- Backfill contact_id via session email
UPDATE "rsvps" r
SET "contact_id" = c."id"
FROM "visitor_sessions" vs
JOIN "contacts" c ON c."email" = vs."email"
WHERE r."session_id" = vs."id" AND r."contact_id" IS NULL;

-- Backfill contact_id via user
UPDATE "rsvps" r
SET "contact_id" = c."id"
FROM "contacts" c
WHERE c."user_id" = r."user_id" AND r."contact_id" IS NULL;

-- Partial unique index: one RSVP per contact per event
CREATE UNIQUE INDEX "rsvps_event_contact_idx" ON "rsvps"("event_id", "contact_id") WHERE "contact_id" IS NOT NULL;
CREATE INDEX "rsvps_contact_idx" ON "rsvps"("contact_id") WHERE "contact_id" IS NOT NULL;
CREATE INDEX "contacts_user_idx" ON "contacts"("user_id") WHERE "user_id" IS NOT NULL;
