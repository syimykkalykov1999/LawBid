-- Owner 2026-10-18 (OQ-054): «Вам ещё нужен адвокат?» is its own
-- notification type. Enum value in its own migration: a new value cannot be
-- used in the transaction that adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'case_still_needed';
