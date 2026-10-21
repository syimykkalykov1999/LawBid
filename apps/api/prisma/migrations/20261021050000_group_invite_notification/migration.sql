-- Owner 2026-10-21: a group invitation. Enum value in its own migration: a
-- new value cannot be used in the transaction that adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'group_invite';
