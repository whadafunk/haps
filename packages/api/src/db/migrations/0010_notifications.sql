CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid REFERENCES "visitor_sessions"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "event_id" uuid REFERENCES "events"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "body" text NOT NULL,
  "link" text,
  "read" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "notifications_session_idx" ON "notifications"("session_id") WHERE "session_id" IS NOT NULL;
CREATE INDEX "notifications_user_idx" ON "notifications"("user_id") WHERE "user_id" IS NOT NULL;
