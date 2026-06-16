-- One guest entry per operator user account
create unique index if not exists "guests_user_id_unique_idx" on "guests" ("user_id") where "user_id" is not null;
