ALTER TABLE "events" ADD COLUMN "welcome_message" text;
ALTER TABLE "visitor_sessions" ADD COLUMN "messaging_opt_out" boolean NOT NULL DEFAULT false;
