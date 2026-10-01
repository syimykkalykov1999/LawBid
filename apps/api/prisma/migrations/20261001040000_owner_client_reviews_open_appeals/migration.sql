-- Owner 2026-09-30: anyone (attorney or client) may review a client to
-- warn others, without a shared case; one review per author per client
-- (service-enforced). The author deletes it at any time; the reviewed
-- client may appeal — admins accept (remove) or reject (keep), in bulk;
-- an appeal nobody decided in 30 days removes the review by itself.
ALTER TABLE "client_reviews" ALTER COLUMN "case_id" DROP NOT NULL;

CREATE TYPE "review_appeal_status" AS ENUM ('pending', 'accepted', 'rejected', 'auto_removed');

CREATE TABLE "client_review_appeals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "review_id" UUID NOT NULL,
  "appellant_id" UUID NOT NULL,
  "reason" STRING NOT NULL,
  "status" "review_appeal_status" NOT NULL DEFAULT 'pending',
  "auto_remove_at" TIMESTAMPTZ NOT NULL,
  "decided_at" TIMESTAMPTZ NULL,
  "decided_by" UUID NULL,
  "admin_note" STRING NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "client_review_appeals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_review_appeals_reason_len" CHECK (char_length("reason") BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX "client_review_appeals_review_id_key" ON "client_review_appeals"("review_id");
CREATE INDEX "client_review_appeals_status_created_at_idx" ON "client_review_appeals"("status", "created_at");
CREATE INDEX "client_review_appeals_status_auto_remove_at_idx" ON "client_review_appeals"("status", "auto_remove_at");
ALTER TABLE "client_review_appeals" ADD CONSTRAINT "client_review_appeals_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "client_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_review_appeals" ADD CONSTRAINT "client_review_appeals_appellant_id_fkey" FOREIGN KEY ("appellant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "client_reviews_client_id_attorney_id_idx" ON "client_reviews"("client_id", "attorney_id");
