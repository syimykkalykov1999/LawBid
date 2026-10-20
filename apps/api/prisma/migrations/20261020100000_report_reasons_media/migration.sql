-- Owner 2026-10-20 (privacy and moderation): media report categories.
-- Enum values in their own migration: a new value cannot be used in the
-- transaction that adds it.
ALTER TYPE "report_reason" ADD VALUE IF NOT EXISTS 'nudity';
ALTER TYPE "report_reason" ADD VALUE IF NOT EXISTS 'violence';
ALTER TYPE "report_reason" ADD VALUE IF NOT EXISTS 'self_harm';
ALTER TYPE "report_reason" ADD VALUE IF NOT EXISTS 'illegal';
