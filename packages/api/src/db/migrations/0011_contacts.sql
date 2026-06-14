CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"instagram_handle" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "event_tokens" ADD COLUMN "contact_id" uuid;
--> statement-breakpoint
ALTER TABLE "event_tokens" ADD CONSTRAINT "event_tokens_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" ("email") WHERE "email" is not null;
--> statement-breakpoint
CREATE INDEX "event_tokens_contact_idx" ON "event_tokens" ("contact_id") WHERE "contact_id" is not null;
