-- Owner 2026-10-16: two more ways to name a fee in a bid: a percent of the
-- recovery (amount_cents = percent in hundredths) and "agreed later" (0).
ALTER TYPE "public"."fee_type" ADD VALUE IF NOT EXISTS 'contingency';
ALTER TYPE "public"."fee_type" ADD VALUE IF NOT EXISTS 'to_be_agreed';
