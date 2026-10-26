-- Owner 2026-10-25 (privacy round 13): the erasure ledger (S13-1), the
-- per-step deletion proof (S13-10/11/14), the new notice type (S13-14) and
-- the retention role's rights for the purge jobs of S13-5.

-- CreateTable
CREATE TABLE "erasure_ledger" (
    "user_id" UUID NOT NULL,
    "anonymized_at" TIMESTAMPTZ NOT NULL,
    "reason" VARCHAR(24) NOT NULL DEFAULT 'deletion_request',
    "s3_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erasure_ledger_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "deletion_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "step" VARCHAR(40) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "detail" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erasure_ledger_s3_synced_at_idx" ON "erasure_ledger"("s3_synced_at");

-- CreateIndex
CREATE INDEX "deletion_steps_status_updated_at_idx" ON "deletion_steps"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "deletion_steps_user_id_step_key" ON "deletion_steps"("user_id", "step");

-- S13-14: the day-0 / day-13 "your account will be deleted" notice.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'account_deletion_scheduled';

-- S13-5: the nightly purge jobs run under the retention role
-- (RETENTION_DATABASE_URL). The app role cannot update or delete these
-- tables; the retention role may only remove audit / access-log rows and
-- blank the network columns of the contact disclosures (the row itself is
-- the legal record and stays).
DO $$
BEGIN
  GRANT SELECT, DELETE ON TABLE audit_log, data_access_log TO lawbid_retention;
  GRANT SELECT ON TABLE contact_disclosures, legal_holds TO lawbid_retention;
  GRANT UPDATE (ip, device_id) ON TABLE contact_disclosures TO lawbid_retention;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'retention role grants skipped (role missing or no privilege here)';
END $$;
