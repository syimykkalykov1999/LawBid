-- Owner 2026-10-25: invoice life, signing expiry/reminders/view audit,
-- case comment edit history. All additive; existing invoices are `sent`.
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'invoice_sent';
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'invoice_voided';
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'signature_viewed';
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'signature_expired';

CREATE TYPE "case_invoice_status" AS ENUM ('draft', 'sent', 'viewed', 'paid', 'partially_paid', 'overdue', 'void');

ALTER TABLE "case_invoices"
  ADD COLUMN "status" "case_invoice_status" NOT NULL DEFAULT 'sent',
  ADD COLUMN "due_at" TIMESTAMPTZ,
  ADD COLUMN "sent_at" TIMESTAMPTZ,
  ADD COLUMN "viewed_at" TIMESTAMPTZ,
  ADD COLUMN "paid_at" TIMESTAMPTZ,
  ADD COLUMN "voided_at" TIMESTAMPTZ,
  ADD COLUMN "paid_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "late_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "late_fee_applied_at" TIMESTAMPTZ,
  ADD COLUMN "reminders_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "reminders_sent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_reminded_at" TIMESTAMPTZ;
UPDATE "case_invoices" SET "sent_at" = "created_at";
CREATE INDEX "case_invoices_status_due_at_idx" ON "case_invoices"("status", "due_at");

ALTER TABLE "case_sign_requests"
  ADD COLUMN "expires_at" TIMESTAMPTZ,
  ADD COLUMN "expired_at" TIMESTAMPTZ,
  ADD COLUMN "reminders_sent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_reminded_at" TIMESTAMPTZ,
  ADD COLUMN "view_log" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX "case_sign_requests_status_expires_at_idx" ON "case_sign_requests"("status", "expires_at");

ALTER TABLE "case_comments"
  ADD COLUMN "edited_at" TIMESTAMPTZ,
  ADD COLUMN "edit_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "edit_history" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "payment_requests" ADD COLUMN "invoice_id" UUID;
CREATE INDEX "payment_requests_invoice_id_idx" ON "payment_requests"("invoice_id");
