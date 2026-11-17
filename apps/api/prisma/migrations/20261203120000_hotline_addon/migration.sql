SET LOCAL lock_timeout = '5s';
-- Owner row 87 (16.11, hotline plan PR 8): the «Горячая линия» add-on of an
-- attorney's subscription. Expand-only: three nullable / defaulted columns
-- the running release never reads (a constant default is metadata-only in
-- Postgres 11+, no table rewrite).

-- AlterTable
ALTER TABLE "subscriptions"
  ADD COLUMN "hotline_addon" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hotline_addon_ends_at" TIMESTAMPTZ,
  ADD COLUMN "hotline_addon_invoice_id" TEXT;
