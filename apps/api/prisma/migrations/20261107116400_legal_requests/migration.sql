-- Owner 2026-10-28 (legal requests): intake record, gag orders, signed manifest,
-- download counter. Additive only.
ALTER TYPE "data_request_type" ADD VALUE IF NOT EXISTS 'search_warrant';
ALTER TYPE "data_request_type" ADD VALUE IF NOT EXISTS 'preservation';
ALTER TYPE "data_request_type" ADD VALUE IF NOT EXISTS 'emergency';
ALTER TYPE "data_request_type" ADD VALUE IF NOT EXISTS 'civil';
ALTER TYPE "data_request_type" ADD VALUE IF NOT EXISTS 'other';

ALTER TABLE "data_access_requests"
  ADD COLUMN "legal_basis" TEXT,
  ADD COLUMN "country" VARCHAR(2),
  ADD COLUMN "subject_user_id" UUID,
  ADD COLUMN "due_at" TIMESTAMPTZ,
  ADD COLUMN "last_reminded_at" TIMESTAMPTZ,
  ADD COLUMN "do_not_notify" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nondisclosure_until" TIMESTAMPTZ,
  ADD COLUMN "nondisclosure_reminded_at" TIMESTAMPTZ,
  ADD COLUMN "user_notified_at" TIMESTAMPTZ;
CREATE INDEX "data_access_requests_due_at_idx" ON "data_access_requests"("due_at");
CREATE INDEX "data_access_requests_received_at_idx" ON "data_access_requests"("received_at");

ALTER TABLE "legal_exports"
  ADD COLUMN "manifest_sha256" TEXT,
  ADD COLUMN "manifest_signature" TEXT,
  ADD COLUMN "signature_alg" VARCHAR(16),
  ADD COLUMN "download_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_downloaded_at" TIMESTAMPTZ;
