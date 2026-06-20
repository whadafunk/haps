CREATE TABLE "direct_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "from_guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE CASCADE,
  "to_guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE CASCADE,
  "from_session_id" uuid REFERENCES "visitor_sessions"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "dm_thread_idx" ON "direct_messages"("event_id", "from_guest_id", "to_guest_id");
CREATE INDEX "dm_inbox_idx" ON "direct_messages"("to_guest_id", "event_id");

CREATE TABLE "guest_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "blocking_guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE CASCADE,
  "blocked_guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("event_id", "blocking_guest_id", "blocked_guest_id")
);
