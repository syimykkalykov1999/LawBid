-- Owner 2026-10-28 (legal Q&A safety): private-info flags and a duplicate
-- hash on questions and answers; user stickers wait for the media scan;
-- an append-only audit trail on CSAM reports. Additive, defaults keep
-- today's behaviour.
ALTER TABLE "legal_questions"
  ADD COLUMN "safety_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "content_hash" VARCHAR(64);
CREATE INDEX "legal_questions_content_hash_created_at_idx"
  ON "legal_questions" ("content_hash", "created_at" DESC);

ALTER TABLE "legal_answers"
  ADD COLUMN "safety_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "content_hash" VARCHAR(64);
CREATE INDEX "legal_answers_attorney_id_content_hash_idx"
  ON "legal_answers" ("attorney_id", "content_hash");

ALTER TABLE "stickers"
  ADD COLUMN "moderation_status" VARCHAR(12) NOT NULL DEFAULT 'active';

ALTER TABLE "csam_reports"
  ADD COLUMN "audit" JSONB NOT NULL DEFAULT '[]';
