-- Owner 2026-10-15 (Boost): a goal and a button for a promoted post, and the
-- numbers of a promotion by day.
ALTER TABLE "case_promotions" ADD COLUMN "goal" VARCHAR(12);
ALTER TABLE "case_promotions" ADD COLUMN "cta_type" VARCHAR(12);
ALTER TABLE "case_promotions" ADD COLUMN "cta_value" VARCHAR(500);

CREATE TABLE "promotion_daily" (
    "promotion_id" UUID NOT NULL,
    "day_key" VARCHAR(10) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "promotion_daily_pkey" PRIMARY KEY ("promotion_id","day_key")
);

ALTER TABLE "promotion_daily" ADD CONSTRAINT "promotion_daily_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "case_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
