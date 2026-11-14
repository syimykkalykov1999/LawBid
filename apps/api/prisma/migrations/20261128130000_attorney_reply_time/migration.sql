SET LOCAL lock_timeout = '5s';

-- Owner row 112: «Обычно отвечает за …» on the attorney profile, from the
-- nightly `profiles.reply-time` job. Nullable columns, no default: a
-- metadata-only change, no table rewrite.
ALTER TABLE "attorney_profiles" ADD COLUMN "reply_minutes_median" INTEGER;
ALTER TABLE "attorney_profiles" ADD COLUMN "reply_stats_at" TIMESTAMPTZ;
