-- Owner 2026-10-01: up to 10 photos per review (public media, like posts).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photo_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE client_reviews ADD COLUMN IF NOT EXISTS photo_ids UUID[] NOT NULL DEFAULT '{}';
