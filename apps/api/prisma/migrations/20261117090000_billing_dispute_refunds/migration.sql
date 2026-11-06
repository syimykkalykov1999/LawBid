SET LOCAL lock_timeout = '5s';
-- R-237 (owner 2026-11-05): one row per bank inquiry on a subscription charge
-- that the automatic refund acted on or held for a person. New table only.
CREATE TABLE "billing_dispute_refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dispute_id" VARCHAR(80) NOT NULL,
    "user_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(40),
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "refund_id" UUID,
    "decided_by" UUID,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "billing_dispute_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_dispute_refunds_dispute_id_key" ON "billing_dispute_refunds"("dispute_id");
CREATE INDEX "billing_dispute_refunds_user_id_created_at_idx" ON "billing_dispute_refunds"("user_id", "created_at" DESC);
CREATE INDEX "billing_dispute_refunds_created_at_id_idx" ON "billing_dispute_refunds"("created_at" DESC, "id" DESC);
