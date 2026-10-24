-- Security & legal pass 2026-10-24: expand-only. A new, empty table: who
-- (other than the owner) was handed a link to a confidential file, from
-- which device. No file names or text. No foreign keys on purpose (an
-- append-only journal must not block deleting a file or an account).
CREATE TABLE IF NOT EXISTS "file_access_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "file_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "viewer_user_id" UUID NOT NULL,
  "purpose" VARCHAR(32) NOT NULL,
  "session_id" UUID,
  "ip" VARCHAR(64),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "file_access_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "file_access_log_file_id_created_at_idx" ON "file_access_log" ("file_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "file_access_log_owner_user_id_created_at_idx" ON "file_access_log" ("owner_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "file_access_log_viewer_user_id_created_at_idx" ON "file_access_log" ("viewer_user_id", "created_at" DESC);
