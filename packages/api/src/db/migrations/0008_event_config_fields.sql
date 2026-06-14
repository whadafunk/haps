ALTER TABLE "events" ADD COLUMN "location_lat" text;
ALTER TABLE "events" ADD COLUMN "location_lng" text;
ALTER TABLE "events" ADD COLUMN "dress_code" text;
ALTER TABLE "events" ADD COLUMN "allow_plus_ones" boolean DEFAULT false NOT NULL;
ALTER TABLE "events" ADD COLUMN "max_plus_ones" integer;
