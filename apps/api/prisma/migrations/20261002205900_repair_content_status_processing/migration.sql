-- Repair: a restored database can miss the `processing` value that
-- 20261001210000_owner_video_enums adds. Idempotent.
ALTER TYPE content_status ADD VALUE IF NOT EXISTS 'processing';
