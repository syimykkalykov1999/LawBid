-- Boost can be paid with stars (owner 2026-10-20).
ALTER TABLE "case_promotions" ADD COLUMN "paid_stars" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "case_promotions" ADD COLUMN "refunded_stars" INTEGER NOT NULL DEFAULT 0;
