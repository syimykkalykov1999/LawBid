-- Owner 2026-10-20: a new post in a channel I subscribed to. Enum value in
-- its own migration: a new value cannot be used in the transaction that
-- adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'channel_post';
