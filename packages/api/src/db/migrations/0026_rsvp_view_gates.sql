ALTER TABLE "events" ADD COLUMN "guests_require_rsvp" boolean NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "wall_requires_rsvp" boolean NOT NULL DEFAULT false;
