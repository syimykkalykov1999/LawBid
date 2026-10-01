-- Owner 2026-10-01: video posts (Bunny Stream). A post with a video that
-- is still encoding waits as `processing` (not in any feed) and goes
-- `published` when the video is ready.
ALTER TYPE content_status ADD VALUE IF NOT EXISTS 'processing';

CREATE TYPE video_asset_status AS ENUM (
  'awaiting_upload', 'processing', 'ready', 'failed', 'rejected', 'deleted'
);
