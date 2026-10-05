-- Owner 2026-10-05 («Борьба с мошенниками»): a verifier's clearance opens
-- the badge and payments for good; the last "request more documents".
ALTER TABLE "attorney_trust" ADD COLUMN "staff_cleared_at" TIMESTAMPTZ;
ALTER TABLE "attorney_trust" ADD COLUMN "staff_cleared_by" UUID;
ALTER TABLE "attorney_trust" ADD COLUMN "staff_cleared_note" STRING(500);
ALTER TABLE "attorney_trust" ADD COLUMN "documents_requested_at" TIMESTAMPTZ;
ALTER TABLE "attorney_trust" ADD COLUMN "documents_requested_template" STRING(32);
