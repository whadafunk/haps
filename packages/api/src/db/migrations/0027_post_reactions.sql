CREATE TABLE "post_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "visitor_sessions"("id") ON DELETE CASCADE,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE CASCADE,
  "emoji" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "post_reactions_session_emoji_idx" ON "post_reactions" ("post_id","session_id","emoji") WHERE "session_id" IS NOT NULL;
CREATE UNIQUE INDEX "post_reactions_guest_emoji_idx" ON "post_reactions" ("post_id","guest_id","emoji") WHERE "guest_id" IS NOT NULL;
