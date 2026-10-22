-- Owner 2026-10-22 (client economy plan, package F — notifications,
-- channels, Q&A, comments: apply the event, do not reload).
-- notifications.updated_at moves when a row is read or re-aggregated, so
-- GET /notifications?updatedSince returns exactly what changed (a pill
-- read on another device included). Existing rows start at their
-- created_at. Plain CREATE INDEX: Prisma runs a migration in a
-- transaction, where CONCURRENTLY is not allowed.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE "notifications" SET "updated_at" = "created_at";

CREATE INDEX IF NOT EXISTS "notifications_user_id_updated_at_idx"
  ON "notifications" ("user_id", "updated_at" DESC);

-- «Мои вопросы» as a delta (a client's own questions changed since).
CREATE INDEX IF NOT EXISTS "legal_questions_author_id_updated_at_idx"
  ON "legal_questions" ("author_id", "updated_at");
