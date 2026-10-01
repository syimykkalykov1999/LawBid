-- Owner 2026-09-30: attorneys may bid on cases outside their own
-- practices; such a bid is marked so the client is warned.
ALTER TABLE "bids" ADD COLUMN "outside_practice" BOOL NOT NULL DEFAULT false;
