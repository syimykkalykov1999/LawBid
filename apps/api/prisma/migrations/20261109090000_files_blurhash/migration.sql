-- Nullable placeholder hash for images; no backfill needed to deploy.
ALTER TABLE "files" ADD COLUMN "blurhash" VARCHAR(40);
