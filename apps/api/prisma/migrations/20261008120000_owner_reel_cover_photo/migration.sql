-- Owner 2026-10-08: a reel's cover can be a photo from the gallery (a
-- clean post_image) instead of a frame of the video. Additive.
ALTER TABLE video_assets ADD COLUMN IF NOT EXISTS cover_file_id UUID NULL;
ALTER TABLE video_assets ADD CONSTRAINT video_assets_cover_file_fkey FOREIGN KEY (cover_file_id) REFERENCES files (id) ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX IF NOT EXISTS video_assets_cover_file_id_idx ON video_assets (cover_file_id);
