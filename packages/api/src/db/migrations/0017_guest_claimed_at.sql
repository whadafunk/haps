alter table "guests" add column "claimed_at" timestamptz;

-- Backfill: existing claimed guests (those with a password) get claimed_at = updated_at
update "guests" set "claimed_at" = "updated_at" where "password_hash" is not null;
