-- Owner 2026-10-21 (inbox 30): «an assistant prepared a bid draft».
-- Enum value in its own migration: it cannot be used in the transaction
-- that adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'assistant_bid_draft';
