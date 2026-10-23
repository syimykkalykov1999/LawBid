-- Owner 2026-10-22 (systems checklist §12, Stripe Tax): the tax inside a
-- payment and the amount before it. Expand only: two nullable columns.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "tax_cents" INTEGER;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "subtotal_cents" INTEGER;
