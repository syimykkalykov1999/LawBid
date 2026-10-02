-- Owner 2026-10-02: reels/posts like Instagram — a location under the
-- author's name and "turn off commenting". Additive and idempotent.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_name STRING;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_lat FLOAT8;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_lng FLOAT8;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_enabled BOOL NOT NULL DEFAULT true;
