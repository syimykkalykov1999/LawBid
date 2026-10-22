-- Owner 2026-10-22 (audit #4 §5): automated image / video-thumbnail moderation
-- (AWS Rekognition) and CSAM reports (PhotoDNA / NCMEC adapters).
-- CreateTable
CREATE TABLE "media_moderation_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID,
    "video_asset_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "purpose" VARCHAR(24) NOT NULL,
    "content_sha256" VARCHAR(64),
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "csam_status" VARCHAR(16) NOT NULL DEFAULT 'not_checked',
    "provider" VARCHAR(24),
    "labels" JSONB NOT NULL DEFAULT '[]',
    "max_confidence" DOUBLE PRECISION,
    "top_label" VARCHAR(120),
    "skip_reason" VARCHAR(40),
    "error" VARCHAR(500),
    "hidden_targets" JSONB NOT NULL DEFAULT '[]',
    "decision" VARCHAR(10),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_at" TIMESTAMPTZ,

    CONSTRAINT "media_moderation_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csam_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "provider" VARCHAR(16) NOT NULL DEFAULT 'ncmec',
    "external_report_id" VARCHAR(64),
    "error" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ,

    CONSTRAINT "csam_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_moderation_checks_file_id_key" ON "media_moderation_checks"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_moderation_checks_video_asset_id_key" ON "media_moderation_checks"("video_asset_id");

-- CreateIndex
CREATE INDEX "media_moderation_checks_status_idx" ON "media_moderation_checks"("status", "created_at");

-- CreateIndex
CREATE INDEX "media_moderation_checks_sha_idx" ON "media_moderation_checks"("content_sha256");

-- CreateIndex
CREATE INDEX "media_moderation_checks_owner_idx" ON "media_moderation_checks"("owner_user_id");

-- CreateIndex
CREATE INDEX "csam_reports_status_idx" ON "csam_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "csam_reports_check_idx" ON "csam_reports"("check_id");

-- AddForeignKey
ALTER TABLE "csam_reports" ADD CONSTRAINT "csam_reports_check_fkey" FOREIGN KEY ("check_id") REFERENCES "media_moderation_checks"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

