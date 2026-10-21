-- Owner 2026-10-21: «Закрыть вопрос» and the nightly sweep.
ALTER TABLE "legal_questions" ADD COLUMN "closed_at" TIMESTAMPTZ;
CREATE INDEX "legal_questions_closed_at_deleted_at_idx" ON "legal_questions"("closed_at", "deleted_at");
