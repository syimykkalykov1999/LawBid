-- Media batch A (row 97, audit docs/dev/MEDIA_PIPELINE_AUDIT_2026-11-13.md).
-- Additive only: two nullable columns, no default, no rewrite, no lock beyond
-- the instant catalog change.
--
-- R1: a file the antivirus could not scan because it is over clamd's size
-- limit is kept (never deleted) and set aside for a person to look at:
-- scan_status stays 'failed' (not attachable) and scan_skipped says why
-- ('too_large'). The automatic storage cleanup leaves such rows alone.
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "scan_skipped" VARCHAR(16);

-- R11: the MP4 fallback rendition Bunny really stored for this video
-- ('720p', '480p' …), '' = checked and there is none, NULL = not checked yet
-- (older rows keep the former play_720p.mp4 link).
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "mp4_fallback" VARCHAR(8);
