-- Row 65 (10M load test 2026-11-12, /data/lt/results/NOTES.md): the
-- videos.sweep cron (every minute, post-videos.service.ts step b2) asks for
-- posts still `processing` next to a video, oldest first:
--   status = $1 AND deleted_at IS NULL AND video_asset_id IS NOT NULL
--   ORDER BY created_at LIMIT 100
-- No index fit: Postgres walked posts_video_asset_id_key over every video
-- post and filtered them (3 M rows, 3 015 324 buffers, ~1 s idle, 3-7.5 s
-- under load). With this index: Index Scan, 3 buffers, 0.04 ms.
-- `status` is a key column, not part of the WHERE: Prisma sends
-- CAST($1::text AS content_status), an I/O cast Postgres does not fold to a
-- constant, so a partial index `WHERE status = 'processing'` is never
-- chosen (EXPLAIN on the 10M copy; same reason as the 2026-10-20 feed
-- indexes, which test only IS NULL). The predicate tests only what Prisma
-- writes literally; ~30 bytes per video post (90 MB at 3 M video posts).
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_video_status_created_idx
  ON posts (status, created_at)
  WHERE video_asset_id IS NOT NULL AND deleted_at IS NULL;
