ALTER TABLE "events" DROP COLUMN "location_lat";
ALTER TABLE "events" DROP COLUMN "location_lng";
ALTER TABLE "events" ADD COLUMN "coordinates" text;
