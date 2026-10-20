-- Owner 2026-10-20: booking a consultation (slots, bookings, planner link),
-- «Вопрос юристу» (questions, answers, likes), deadline calculator (rules,
-- court holidays). Expand-only: new tables and nullable columns.

-- CreateEnum
CREATE TYPE "consultation_status" AS ENUM ('pending', 'confirmed', 'declined', 'cancelled');

-- CreateEnum
CREATE TYPE "deadline_kind" AS ENUM ('court_deadline', 'statute_of_limitations');

-- CreateEnum
CREATE TYPE "deadline_unit" AS ENUM ('day', 'month', 'year');

-- CreateEnum
CREATE TYPE "deadline_day_type" AS ENUM ('calendar', 'business');

-- CreateEnum
CREATE TYPE "deadline_direction" AS ENUM ('after', 'before');

-- AlterTable
ALTER TABLE "attorney_tasks" ADD COLUMN IF NOT EXISTS "consultation_id" UUID;

-- AlterTable
-- Also added by the planner reminders work: the same column, idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "consultation_settings" (
    "attorney_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "slot_minutes" SMALLINT NOT NULL DEFAULT 30,
    "buffer_minutes" SMALLINT NOT NULL DEFAULT 0,
    "min_notice_hours" SMALLINT NOT NULL DEFAULT 12,
    "horizon_days" SMALLINT NOT NULL DEFAULT 30,
    "auto_confirm" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "consultation_settings_pkey" PRIMARY KEY ("attorney_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "consultation_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attorney_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "consultation_time_off" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attorney_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "note" VARCHAR(120),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "consultations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attorney_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "status" "consultation_status" NOT NULL DEFAULT 'pending',
    "note" VARCHAR(500),
    "case_id" UUID,
    "conversation_id" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(300),
    "rescheduled_at" TIMESTAMPTZ,
    "reminded_day_at" TIMESTAMPTZ,
    "reminded_hour_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legal_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "practice_area_id" UUID,
    "state_code" CHAR(2),
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(3000) NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "content_status" NOT NULL DEFAULT 'published',
    "answer_count" INTEGER NOT NULL DEFAULT 0,
    "best_answer_id" UUID,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "legal_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legal_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'published',
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "is_best" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "legal_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legal_answer_likes" (
    "answer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_answer_likes_pkey" PRIMARY KEY ("answer_id","user_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "deadline_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jurisdiction" VARCHAR(2) NOT NULL,
    "kind" "deadline_kind" NOT NULL,
    "code" TEXT NOT NULL,
    "labels" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "unit" "deadline_unit" NOT NULL DEFAULT 'day',
    "day_type" "deadline_day_type" NOT NULL DEFAULT 'calendar',
    "direction" "deadline_direction" NOT NULL DEFAULT 'after',
    "practice_code" VARCHAR(80),
    "citation" VARCHAR(160),
    "notes" JSONB,
    "source_url" VARCHAR(300),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "deadline_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "court_holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jurisdiction" VARCHAR(2) NOT NULL,
    "date" DATE NOT NULL,
    "names" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "court_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "consultation_windows_attorney_id_weekday_idx" ON "consultation_windows"("attorney_id", "weekday");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "consultation_time_off_attorney_id_starts_on_idx" ON "consultation_time_off"("attorney_id", "starts_on");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "consultations_attorney_id_starts_at_idx" ON "consultations"("attorney_id", "starts_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "consultations_client_id_starts_at_idx" ON "consultations"("client_id", "starts_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "consultations_status_starts_at_idx" ON "consultations"("status", "starts_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_questions_status_created_at_idx" ON "legal_questions"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_questions_practice_area_id_created_at_idx" ON "legal_questions"("practice_area_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_questions_state_code_created_at_idx" ON "legal_questions"("state_code", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_questions_author_id_created_at_idx" ON "legal_questions"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_answers_attorney_id_created_at_idx" ON "legal_answers"("attorney_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "legal_answers_question_id_attorney_id_key" ON "legal_answers"("question_id", "attorney_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "deadline_rules_code_key" ON "deadline_rules"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deadline_rules_jurisdiction_kind_is_active_idx" ON "deadline_rules"("jurisdiction", "kind", "is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "court_holidays_date_idx" ON "court_holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "court_holidays_jurisdiction_date_key" ON "court_holidays"("jurisdiction", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attorney_tasks_consultation_idx" ON "attorney_tasks"("consultation_id");

-- AddForeignKey
ALTER TABLE "consultation_settings" ADD CONSTRAINT "consultation_settings_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consultation_windows" ADD CONSTRAINT "consultation_windows_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consultation_time_off" ADD CONSTRAINT "consultation_time_off_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "legal_questions" ADD CONSTRAINT "legal_questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "legal_questions" ADD CONSTRAINT "legal_questions_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "legal_questions" ADD CONSTRAINT "legal_questions_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "legal_answers" ADD CONSTRAINT "legal_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "legal_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "legal_answers" ADD CONSTRAINT "legal_answers_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "legal_answer_likes" ADD CONSTRAINT "legal_answer_likes_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "legal_answers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "legal_answer_likes" ADD CONSTRAINT "legal_answer_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Bounds the API also checks (defence in depth).
ALTER TABLE "consultation_settings"
  ADD CONSTRAINT "consultation_settings_bounds_check" CHECK (
    "slot_minutes" BETWEEN 10 AND 240 AND "buffer_minutes" BETWEEN 0 AND 120
    AND "min_notice_hours" BETWEEN 0 AND 336 AND "horizon_days" BETWEEN 1 AND 90);
ALTER TABLE "consultation_windows"
  ADD CONSTRAINT "consultation_windows_bounds_check" CHECK (
    "weekday" BETWEEN 1 AND 7 AND "start_minute" BETWEEN 0 AND 1439
    AND "end_minute" BETWEEN 1 AND 1440 AND "end_minute" > "start_minute");
ALTER TABLE "consultation_time_off"
  ADD CONSTRAINT "consultation_time_off_range_check" CHECK ("ends_on" >= "starts_on");
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_range_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "legal_questions"
  ADD CONSTRAINT "legal_questions_text_check" CHECK (
    char_length(btrim("title")) >= 5 AND char_length(btrim("body")) >= 10);
ALTER TABLE "legal_answers"
  ADD CONSTRAINT "legal_answers_text_check" CHECK (char_length(btrim("body")) >= 10);
ALTER TABLE "deadline_rules"
  ADD CONSTRAINT "deadline_rules_amount_check" CHECK ("amount" BETWEEN 1 AND 3650);
