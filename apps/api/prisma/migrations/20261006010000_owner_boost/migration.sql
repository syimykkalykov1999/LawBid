-- Owner 2026-10-05: Instagram-style promotion for posts and cases without a
-- subscription: budget → impressions at the admin's CPM, audience, reach,
-- clicks, per-person frequency cap (promotion_views).
-- AlterTable
ALTER TABLE "case_promotions" ADD COLUMN     "audience" JSONB;
ALTER TABLE "case_promotions" ADD COLUMN     "clicks" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "case_promotions" ADD COLUMN     "cpm_cents" INT4;
ALTER TABLE "case_promotions" ADD COLUMN     "post_id" UUID;
ALTER TABLE "case_promotions" ADD COLUMN     "reach" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "case_promotions" ADD COLUMN     "refunded_cents" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "case_promotions" ADD COLUMN     "reviewed_at" TIMESTAMPTZ;
ALTER TABLE "case_promotions" ADD COLUMN     "reviewed_by" UUID;
ALTER TABLE "case_promotions" ADD COLUMN     "target_impressions" INT4;
ALTER TABLE "case_promotions" ADD COLUMN     "target_type" STRING(8) NOT NULL DEFAULT 'case';
ALTER TABLE "case_promotions" ALTER COLUMN "case_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "promotion_views" (
    "promotion_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "impressions" INT4 NOT NULL DEFAULT 0,
    "day_key" STRING(10) NOT NULL,
    "day_count" INT4 NOT NULL DEFAULT 0,
    "clicked" BOOL NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_views_pkey" PRIMARY KEY ("promotion_id","user_id")
);

-- CreateIndex
CREATE INDEX "promotion_views_user_id_last_seen_at_idx" ON "promotion_views"("user_id", "last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "case_promotions_post_id_idx" ON "case_promotions"("post_id");

-- CreateIndex
CREATE INDEX "case_promotions_target_type_status_ends_at_idx" ON "case_promotions"("target_type", "status", "ends_at");

-- AddForeignKey
ALTER TABLE "promotion_views" ADD CONSTRAINT "promotion_views_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "case_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


