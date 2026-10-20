-- Owner 2026-10-20: stories, channels and channel posts can be reported
-- (the moderation queue). Enum values in their own migration: a new value
-- cannot be used in the transaction that adds it.
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'story';
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'channel';
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'channel_post';
