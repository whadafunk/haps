-- Wall posts and photo album tables

ALTER TABLE "events" ADD COLUMN "show_album" boolean NOT NULL DEFAULT true;

CREATE TABLE "album_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "visitor_sessions"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "uploader_name" text NOT NULL,
  "url" text NOT NULL,
  "caption" text,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "album_photos_event_idx" ON "album_photos" ("event_id");

CREATE TABLE "posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "visitor_sessions"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "author_name" text NOT NULL,
  "body" text,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "posts_event_created_idx" ON "posts" ("event_id", "created_at") WHERE "deleted_at" IS NULL;

CREATE TABLE "post_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "photo_id" uuid NOT NULL REFERENCES "album_photos"("id"),
  "sort_order" integer NOT NULL DEFAULT 0
);
