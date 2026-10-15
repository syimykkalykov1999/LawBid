-- Owner 2026-10-15: events from the app (screen views, a few key actions),
-- counted by day. The phone sends them in batches; the API adds up the
-- counts instead of keeping one row per event, so the table stays tiny
-- (names x screens x days). Old days are purged by the nightly retention.
CREATE TABLE "app_event_days" (
    "day" DATE NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "screen" VARCHAR(80) NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "app_event_days_pkey" PRIMARY KEY ("day","name","screen")
);
