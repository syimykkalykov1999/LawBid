-- Owner 2026-10-05: payment requests (invoices, installments) from the
-- attorney, who covers Stripe's fee per payment, saved cards per attorney
-- account. Additive.

-- AlterTable
ALTER TABLE "case_payments" ADD COLUMN "request_id" UUID;
ALTER TABLE "case_payments" ADD COLUMN "processing_fee_payer" STRING(16) NOT NULL DEFAULT 'client';

-- CreateIndex
CREATE INDEX "case_payments_request_id_idx" ON "case_payments"("request_id");

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "amount_cents" INT4 NOT NULL,
    "description" STRING(200) NOT NULL,
    "due_at" TIMESTAMPTZ,
    "status" STRING(16) NOT NULL DEFAULT 'open',
    "plan_id" UUID,
    "seq" INT4 NOT NULL DEFAULT 1,
    "total" INT4 NOT NULL DEFAULT 1,
    "payment_id" UUID,
    "paid_at" TIMESTAMPTZ,
    "canceled_at" TIMESTAMPTZ,
    "last_reminded_at" TIMESTAMPTZ,
    "reminders_sent" INT4 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_customers" (
    "client_id" UUID NOT NULL,
    "stripe_account_id" STRING NOT NULL,
    "stripe_customer_id" STRING NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connected_customers_pkey" PRIMARY KEY ("client_id","stripe_account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_payment_id_key" ON "payment_requests"("payment_id");

-- CreateIndex
CREATE INDEX "payment_requests_case_id_created_at_idx" ON "payment_requests"("case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payment_requests_client_id_status_due_at_idx" ON "payment_requests"("client_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "payment_requests_attorney_id_created_at_idx" ON "payment_requests"("attorney_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payment_requests_status_due_at_idx" ON "payment_requests"("status", "due_at");

-- Notification types of payment requests.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_request_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_request_due';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_request_overdue';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_request_canceled';
