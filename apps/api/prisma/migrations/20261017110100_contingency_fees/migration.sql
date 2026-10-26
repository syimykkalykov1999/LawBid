-- Owner 2026-10-17: a percent of the recovery, in basis points (3300 = 33 %).
ALTER TABLE "cases" ADD COLUMN "budget_percent_bps" INTEGER;
ALTER TABLE "cases" DROP CONSTRAINT "cases_budget_mode_ck";
ALTER TABLE "cases" ADD CONSTRAINT "cases_budget_mode_ck" CHECK (
  ("budget_mode" = 'amount') = ("budget_cents" IS NOT NULL)
  AND ("budget_mode" = 'percent') = ("budget_percent_bps" IS NOT NULL)
);
ALTER TABLE "cases" ADD CONSTRAINT "cases_budget_percent_bps_ck"
  CHECK ("budget_percent_bps" BETWEEN 1 AND 10000);

ALTER TABLE "bids" ADD COLUMN "percent_bps" INTEGER;
ALTER TABLE "bids" ADD CONSTRAINT "bids_percent_bps_ck" CHECK (
  ("fee_type" = 'contingency') = ("percent_bps" IS NOT NULL)
  AND ("percent_bps" BETWEEN 1 AND 10000)
);

ALTER TABLE "bid_offers" ADD COLUMN "percent_bps" INTEGER;
ALTER TABLE "bid_offers" ADD CONSTRAINT "bid_offers_percent_bps_ck" CHECK (
  ("fee_type" = 'contingency') = ("percent_bps" IS NOT NULL)
  AND ("percent_bps" BETWEEN 1 AND 10000)
);
