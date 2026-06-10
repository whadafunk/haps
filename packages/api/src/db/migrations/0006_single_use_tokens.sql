ALTER TABLE "event_tokens" ADD COLUMN "single_use" boolean NOT NULL DEFAULT false;
ALTER TABLE "event_tokens" ADD COLUMN "claimed_by_session_id" uuid;
ALTER TABLE "event_tokens" ADD CONSTRAINT "event_tokens_claimed_by_session_id_visitor_sessions_id_fk" FOREIGN KEY ("claimed_by_session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE set null ON UPDATE no action;
