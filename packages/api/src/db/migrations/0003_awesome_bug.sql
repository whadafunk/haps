CREATE TABLE IF NOT EXISTS "instance_config" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_name" text DEFAULT 'Haps' NOT NULL,
	"smtp_host" text,
	"smtp_port" integer DEFAULT 587 NOT NULL,
	"smtp_user" text,
	"smtp_pass" text,
	"smtp_from" text,
	"default_theme" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
