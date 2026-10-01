-- Owner 2026-10-01: client reviews in the moderation queue, and Google's
-- review policy categories as report reasons.
ALTER TYPE report_target_type ADD VALUE IF NOT EXISTS 'client_review';
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'off_topic';
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'conflict_of_interest';
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'profanity';
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'harassment';
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'hate_speech';
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'personal_info';
