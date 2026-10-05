-- Owner 2026-10-05: reels like Instagram (trim + cover frame), up to 9
-- documents per post / reel inner page, and video calls behind the
-- `video_calls` flag. Additive.
CREATE TABLE IF NOT EXISTS post_attachments (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    file_id UUID NOT NULL,
    file_name STRING NOT NULL,
    position INT2 NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT post_attachments_pkey PRIMARY KEY (id ASC)
);
CREATE UNIQUE INDEX IF NOT EXISTS post_attachments_file_id_key ON post_attachments(file_id);
CREATE UNIQUE INDEX IF NOT EXISTS post_attachments_post_id_position_key ON post_attachments(post_id, position);
ALTER TABLE post_attachments ADD CONSTRAINT post_attachments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE post_attachments ADD CONSTRAINT post_attachments_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE video_assets ADD COLUMN IF NOT EXISTS trim_start_ms INT4;
ALTER TABLE video_assets ADD COLUMN IF NOT EXISTS trim_end_ms INT4;
ALTER TABLE video_assets ADD COLUMN IF NOT EXISTS cover_time_ms INT4;

ALTER TABLE calls ADD COLUMN IF NOT EXISTS video BOOL NOT NULL DEFAULT false;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('video_calls', false, 100, 'Video calls in chats (WebRTC, needs TURN in Admin → Integrations)', now())
ON CONFLICT (key) DO NOTHING;
