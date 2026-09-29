-- docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §14 (stage 5.1) — the only schema
-- migration of file 05.

-- §3.3: "Изменено" mark after a text edit.
ALTER TABLE "posts" ADD COLUMN "edited_at" TIMESTAMPTZ;

-- §9.4: aggregation (post_like, comment_like, new_follower): one row per
-- recipient and object per 1-hour window.
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" STRING;
ALTER TABLE "notifications" ADD COLUMN "aggregate_count" INT4 NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "notifications_user_dedupe_uq" ON "notifications" ("user_id", "dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;

-- §13 / §14: app_config tunables. ON CONFLICT DO NOTHING keeps values
-- changed in the admin panel.
INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('rate_limit.post_create_per_day', '10'::JSONB, now()),
  ('rate_limit.comment_per_hour', '30'::JSONB, now()),
  ('rate_limit.like_per_hour', '300'::JSONB, now()),
  ('rate_limit.follow_per_day', '200'::JSONB, now()),
  ('rate_limit.message_per_minute', '60'::JSONB, now()),
  ('rate_limit.search_per_minute', '30'::JSONB, now()),
  ('rate_limit.report_per_day', '20'::JSONB, now()),
  ('notifications.retention_days', '180'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;
