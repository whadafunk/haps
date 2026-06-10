-- users: add phone and instagram fields
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "instagram_handle" text;--> statement-breakpoint

-- visitor_sessions: add profile and status fields
ALTER TABLE "visitor_sessions" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD COLUMN "status_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD COLUMN "status_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_status_by_users_id_fk" FOREIGN KEY ("status_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitor_sessions_user_idx" ON "visitor_sessions" USING btree ("user_id") WHERE "visitor_sessions"."user_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitor_sessions_status_idx" ON "visitor_sessions" USING btree ("status") WHERE "visitor_sessions"."status" != 'active';--> statement-breakpoint

-- event_tokens: replace boolean revoked with text status
ALTER TABLE "event_tokens" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE "event_tokens" SET "status" = 'blacklisted' WHERE "revoked" = true;--> statement-breakpoint
ALTER TABLE "event_tokens" DROP COLUMN "revoked";--> statement-breakpoint
DROP INDEX IF EXISTS "event_tokens_event_type_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_tokens_event_type_idx" ON "event_tokens" USING btree ("event_id","type") WHERE "event_tokens"."status" = 'active';--> statement-breakpoint

-- email_blocklist: new table for blocking emails
CREATE TABLE IF NOT EXISTS "email_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"permanent" boolean DEFAULT false NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);--> statement-breakpoint
ALTER TABLE "email_blocklist" ADD CONSTRAINT "email_blocklist_email_unique" UNIQUE("email");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_blocklist" ADD CONSTRAINT "email_blocklist_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
