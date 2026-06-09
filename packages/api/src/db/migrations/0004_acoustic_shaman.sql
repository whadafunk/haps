CREATE TABLE IF NOT EXISTS "delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_message_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"recipient_email" text,
	"recipient_phone" text,
	"recipient_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"type" text DEFAULT 'message' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_event_message_id_event_messages_id_fk" FOREIGN KEY ("event_message_id") REFERENCES "public"."event_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_session_id_visitor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_jobs_pending_idx" ON "delivery_jobs" USING btree ("status","created_at") WHERE "delivery_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_messages_event_created_idx" ON "event_messages" USING btree ("event_id","created_at") WHERE "event_messages"."deleted_at" is null;