CREATE TABLE "guest_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_session_id" uuid REFERENCES "visitor_sessions"("id") ON DELETE SET NULL,
  "from_guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE CASCADE,
  "to_guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "revealed" boolean NOT NULL DEFAULT false,
  "event_context" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("from_guest_id", "to_guest_id", "event_id", "type")
);
CREATE INDEX "guest_signals_from_guest_idx" ON "guest_signals"("from_guest_id");
CREATE INDEX "guest_signals_to_guest_idx" ON "guest_signals"("to_guest_id");
CREATE INDEX "guest_signals_event_idx" ON "guest_signals"("event_id");
