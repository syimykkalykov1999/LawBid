-- Owner 2026-10-05 (legal): DMCA / copyright notices.
-- A new report reason: the mobile report sheet routes «copyright» to the
-- DMCA form, which files a report with this reason next to the notice.
ALTER TYPE "report_reason" ADD VALUE IF NOT EXISTS 'copyright';

-- Repeat-infringer counter (17 U.S.C. §512(i)): every DMCA removal adds
-- one; at legal.settings.dmcaStrikesToSuspend (default 3) the account is
-- suspended. A restore after a counter-notice takes one back.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "copyright_strikes" INT4 NOT NULL DEFAULT 0;

-- The notice itself with the §512(c)(3) elements, the decision and the
-- author's counter-notice (§512(g)).
CREATE TABLE "dmca_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID,
    "target_type" "report_target_type",
    "target_id" UUID,
    "infringing_url" STRING(1000),
    "complainant_name" STRING(200) NOT NULL,
    "complainant_email" STRING(254) NOT NULL,
    "complainant_address" STRING(500) NOT NULL,
    "complainant_phone" STRING(40),
    "work_description" STRING(4000) NOT NULL,
    "good_faith" BOOL NOT NULL,
    "accuracy_sworn" BOOL NOT NULL,
    "signature" STRING(200) NOT NULL,
    "status" STRING(24) NOT NULL DEFAULT 'new',
    "submitted_by_user_id" UUID,
    "author_user_id" UUID,
    "counter" JSONB,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "decision_note" STRING(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dmca_notices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dmca_notices_status_created_at_idx" ON "dmca_notices"("status", "created_at");
CREATE INDEX "dmca_notices_submitted_by_user_id_idx" ON "dmca_notices"("submitted_by_user_id");
CREATE INDEX "dmca_notices_target_type_target_id_idx" ON "dmca_notices"("target_type", "target_id");
ALTER TABLE "dmca_notices" ADD CONSTRAINT "dmca_notices_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dmca_notices" ADD CONSTRAINT "dmca_notices_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
