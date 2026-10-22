-- Owner 2026-10-22 (system audit #2, item 11): maker-checker. A bulk payout
-- or a refund at or above billing.dual_approval_min_cents waits here until a
-- SECOND admin approves it; it runs once, after the approval.
CREATE TABLE "admin_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "rejected_by" UUID,
    "decision_note" VARCHAR(500),
    "result" JSONB,
    "error" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ,
    "executed_at" TIMESTAMPTZ,

    CONSTRAINT "admin_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_approvals_status_check"
        CHECK ("status" IN ('pending', 'approved', 'rejected', 'failed', 'expired')),
    -- The second person is never the first one.
    CONSTRAINT "admin_approvals_four_eyes_check"
        CHECK ("approved_by" IS NULL OR "approved_by" <> "requested_by"),
    CONSTRAINT "admin_approvals_amount_check" CHECK ("amount_cents" >= 0)
);

CREATE INDEX "admin_approvals_status_created_at_idx" ON "admin_approvals"("status", "created_at" DESC);

CREATE INDEX "admin_approvals_requested_by_created_at_idx" ON "admin_approvals"("requested_by", "created_at" DESC);

ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
