-- Owner 2026-10-20: booking a consultation, «Вопрос юристу», deadline
-- calculator. Enum values in their own migration: a new value cannot be
-- used in the transaction that adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'consultation_update';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'legal_question_new';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'legal_answer_update';
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'legal_question';
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'legal_answer';
