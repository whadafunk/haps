CREATE INDEX IF NOT EXISTS "comments_event_created_idx" ON "comments" USING btree ("event_id","created_at") WHERE "comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_tokens_event_type_idx" ON "event_tokens" USING btree ("event_id","type") WHERE "event_tokens"."revoked" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_slug_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_organizer_idx" ON "events" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_status_starts_idx" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_expires_idx" ON "events" USING btree ("expires_at") WHERE "events"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rsvps_event_status_idx" ON "rsvps" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rsvps_session_idx" ON "rsvps" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rsvps_user_idx" ON "rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitor_sessions_user_idx" ON "visitor_sessions" USING btree ("user_id") WHERE "visitor_sessions"."user_id" is not null;