ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "moderate_posts" boolean NOT NULL DEFAULT false;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'approved';
