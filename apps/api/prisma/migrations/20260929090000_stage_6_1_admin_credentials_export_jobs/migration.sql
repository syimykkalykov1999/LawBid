-- docs/06_PRODUCTION.md §10 (stage 6.1): the only schema changes file 06 allows.
CREATE TYPE "data_export_type" AS ENUM ('user_data', 'case_history_pdf');
CREATE TYPE "data_export_status" AS ENUM ('queued', 'processing', 'ready', 'failed', 'expired');

CREATE TABLE "admin_credentials" (
  "user_id" UUID NOT NULL,
  "totp_secret_enc" STRING NOT NULL,
  "totp_enabled_at" TIMESTAMPTZ,
  "recovery_codes_hash" STRING[] NOT NULL DEFAULT ARRAY[]::STRING[],
  "last_login_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "admin_credentials_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "admin_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "data_export_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" "data_export_type" NOT NULL,
  "status" "data_export_status" NOT NULL DEFAULT 'queued',
  "file_id" UUID,
  "expires_at" TIMESTAMPTZ,
  "error" STRING,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "data_export_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "data_export_jobs_user_id_created_at_idx" ON "data_export_jobs"("user_id", "created_at" DESC);
CREATE INDEX "data_export_jobs_status_expires_at_idx" ON "data_export_jobs"("status", "expires_at");

ALTER TABLE "subscriptions" ADD COLUMN "grace_ends_at" TIMESTAMPTZ;
ALTER TABLE "audit_log" ADD COLUMN "justification" STRING;

-- Same grants as the rest of the schema (docs/02 §6.2).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "admin_credentials", "data_export_jobs" TO lawbid_app;
GRANT SELECT ON TABLE "admin_credentials", "data_export_jobs" TO lawbid_readonly;
