-- Owner 2026-11-12 (row 60): «Автоматическое решение по адвокатам». One row
-- per verification request with the automatic decision and all its
-- evidence (the audit trail of every automatic approve / reject), and the
-- owner's own decision on the random audit sample (agreement rate). A new
-- empty table: no lock on existing rows.
SET LOCAL lock_timeout = '5s';

CREATE TABLE "verification_auto_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "proposal" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(40),
    "sample_pct" SMALLINT NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL,
    "auto_action_id" UUID,
    "owner_outcome" VARCHAR(16),
    "owner_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_auto_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "verification_auto_decisions_outcome_check" CHECK ("outcome" IN ('approve', 'reject', 'request_info', 'queue', 'sample')),
    CONSTRAINT "verification_auto_decisions_proposal_check" CHECK ("proposal" IN ('approve', 'reject', 'request_info', 'queue'))
);

CREATE UNIQUE INDEX "verification_auto_decisions_request_id_key" ON "verification_auto_decisions"("request_id");
CREATE INDEX "verification_auto_decisions_outcome_owner_at_idx" ON "verification_auto_decisions"("outcome", "owner_at");
CREATE INDEX "verification_auto_decisions_attorney_id_idx" ON "verification_auto_decisions"("attorney_id");

ALTER TABLE "verification_auto_decisions" ADD CONSTRAINT "verification_auto_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "verification_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
