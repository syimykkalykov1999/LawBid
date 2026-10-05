-- Owner 2026-10-05: storage like Telegram — every file kept once, cleaned
-- up automatically, the database kept small.
--
-- 1. Deduplication: identical uploads share one S3 object, so s3_key is no
--    longer unique. source_sha256 is the hash of the bytes as uploaded
--    (sha256 describes the stored, processed object) and the lookup key.
DROP INDEX IF EXISTS "files"@"files_s3_key_key" CASCADE;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "source_sha256" STRING;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "deleted_reason" STRING(16);
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "files_s3_bucket_s3_key_idx" ON "files"("s3_bucket", "s3_key");
CREATE INDEX IF NOT EXISTS "files_s3_bucket_source_sha256_idx" ON "files"("s3_bucket", "source_sha256");
CREATE INDEX IF NOT EXISTS "files_deleted_at_created_at_idx" ON "files"("deleted_at", "created_at");

-- 2. Per-user storage cap set by an admin (NULL = the app_config default).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "storage_quota_mb" INT4;

-- 3. The cleanup asks "does anything still use this file?" — indexed.
CREATE INDEX IF NOT EXISTS "users_avatar_file_id_idx" ON "users"("avatar_file_id");
CREATE INDEX IF NOT EXISTS "post_media_file_id_idx" ON "post_media"("file_id");
CREATE INDEX IF NOT EXISTS "reviews_photo_ids_idx" ON "reviews" USING GIN ("photo_ids");
CREATE INDEX IF NOT EXISTS "client_reviews_photo_ids_idx" ON "client_reviews" USING GIN ("photo_ids");
CREATE INDEX IF NOT EXISTS "attorney_tasks_file_ids_idx" ON "attorney_tasks" USING GIN ("file_ids");
-- The nightly retention removes old assistant activity by date.
CREATE INDEX IF NOT EXISTS "assistant_activity_created_at_idx" ON "assistant_activity"("created_at");

-- 4. A daily snapshot of what storage and the database take.
CREATE TABLE IF NOT EXISTS "storage_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day" DATE NOT NULL,
    "files_bytes" INT8 NOT NULL,
    "stored_bytes" INT8 NOT NULL,
    "files_count" INT4 NOT NULL,
    "by_purpose" JSONB NOT NULL,
    "db_tables" JSONB NOT NULL,
    "db_bytes" INT8 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storage_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "storage_snapshots_day_key" ON "storage_snapshots"("day");

-- 5. auth_events stays append-only for the app; old rows are removed by
--    the retention role (storage.retention_auth_events_days), like the
--    case journal (docs/02 §6.2–6.3).
GRANT SELECT, DELETE ON TABLE "auth_events" TO "lawbid_retention";
