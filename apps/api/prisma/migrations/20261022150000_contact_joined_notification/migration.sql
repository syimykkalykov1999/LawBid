-- Owner 2026-10-22: "X from your contacts joined LawBid", sent by the
-- server (contacts.joined job). Enum value in its own migration: a new
-- value cannot be used in the transaction that adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'contact_joined';
