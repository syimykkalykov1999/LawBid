SET LOCAL lock_timeout = '5s';

-- Owner 2026-10-28: every «who can» setting becomes a set of audiences
-- (bitmask: 1 = my contacts / phone book, 2 = my followers, 4 = people I
-- follow, 8 = everyone, 0 = nobody). Nullable, no default: adding them is a
-- catalog-only change; NULL means «read the old enum column».
ALTER TABLE "user_privacy_settings"
  ADD COLUMN "last_seen_mask" SMALLINT,
  ADD COLUMN "message_from_mask" SMALLINT,
  ADD COLUMN "call_from_mask" SMALLINT,
  ADD COLUMN "photo_from_mask" SMALLINT,
  ADD COLUMN "about_from_mask" SMALLINT,
  ADD COLUMN "group_add_from_mask" SMALLINT;

-- The old «my contacts» meant phone book OR people I follow: keep exactly
-- that access (1 | 4 = 5). everyone = 8, nobody = 0. One row per person who
-- ever opened the screen; only cells not set yet.
UPDATE "user_privacy_settings" SET
  "last_seen_mask" = COALESCE("last_seen_mask", CASE "last_seen" WHEN 'everyone' THEN 8 WHEN 'contacts' THEN 5 ELSE 0 END),
  "message_from_mask" = COALESCE("message_from_mask", CASE "message_from" WHEN 'everyone' THEN 8 WHEN 'contacts' THEN 5 ELSE 0 END),
  "call_from_mask" = COALESCE("call_from_mask", CASE "call_from" WHEN 'everyone' THEN 8 WHEN 'contacts' THEN 5 ELSE 0 END),
  "photo_from_mask" = COALESCE("photo_from_mask", CASE "photo_from" WHEN 'everyone' THEN 8 WHEN 'contacts' THEN 5 ELSE 0 END),
  "about_from_mask" = COALESCE("about_from_mask", CASE "about_from" WHEN 'everyone' THEN 8 WHEN 'contacts' THEN 5 ELSE 0 END),
  "group_add_from_mask" = COALESCE("group_add_from_mask", CASE "group_add_from" WHEN 'everyone' THEN 8 WHEN 'contacts' THEN 5 ELSE 0 END)
WHERE "last_seen_mask" IS NULL OR "message_from_mask" IS NULL
   OR "call_from_mask" IS NULL OR "photo_from_mask" IS NULL
   OR "about_from_mask" IS NULL OR "group_add_from_mask" IS NULL;
