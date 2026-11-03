SET LOCAL lock_timeout = '5s';
-- Nullable placeholder hash for images; no backfill needed to deploy.
ALTER TABLE "files" ADD COLUMN "blurhash" VARCHAR(40);
