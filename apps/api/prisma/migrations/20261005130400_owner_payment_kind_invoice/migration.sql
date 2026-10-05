-- Owner 2026-10-05: a payment that pays an attorney's payment request
-- (invoice) is kind = 'invoice'; the CHECK from the first migration only
-- knew the four free kinds and refused the insert.
ALTER TABLE "case_payments" DROP CONSTRAINT IF EXISTS "case_payments_kind_check";
ALTER TABLE "case_payments" ADD CONSTRAINT "case_payments_kind_check"
  CHECK (kind IN ('bid', 'deposit', 'balance', 'custom', 'invoice'));
