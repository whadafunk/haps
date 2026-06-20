ALTER TABLE "instance_config" ADD COLUMN "vapid_public_key" text;
ALTER TABLE "instance_config" ADD COLUMN "vapid_private_key" text;

CREATE TABLE "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "visitor_sessions"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("session_id", "endpoint")
);

CREATE INDEX "push_subscriptions_session_idx" ON "push_subscriptions"("session_id");
