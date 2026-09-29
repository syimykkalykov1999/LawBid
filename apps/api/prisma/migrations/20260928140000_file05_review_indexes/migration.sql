-- docs/05 end-of-file load review (see docs/OPEN_QUESTIONS.md OQ-012):
-- indexes only, no table or column changes.

-- §10 badge: unread notifications per user without scanning read history.
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx"
  ON "notifications" ("user_id", "created_at" DESC)
  WHERE "read_at" IS NULL;

-- Stage 5.8 retention job: rows older than retention_days, oldest first.
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx"
  ON "notifications" ("created_at");
