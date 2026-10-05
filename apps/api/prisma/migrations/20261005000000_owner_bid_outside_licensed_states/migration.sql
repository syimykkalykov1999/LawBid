-- Owner 2026-10-04: attorneys may bid on a case in any state. A bid from an
-- attorney with no verified licence in the case's states is marked so the
-- client sees it before accepting.
ALTER TABLE "bids" ADD COLUMN "outside_licensed_states" BOOL NOT NULL DEFAULT false;
