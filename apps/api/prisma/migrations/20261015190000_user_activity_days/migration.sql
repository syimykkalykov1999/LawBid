-- Owner 2026-10-15: own analytics. One row per person per day they opened
-- the app; DAU/MAU, retention and churn are counted from it.
CREATE TABLE "user_activity_days" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "user_activity_days_pkey" PRIMARY KEY ("user_id","day")
);
CREATE INDEX "user_activity_days_day_idx" ON "user_activity_days"("day");
