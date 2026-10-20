-- Owner 2026-10-20: a gift message. Alone in its file: a new enum value
-- cannot be used in the transaction that adds it.
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'gift';
-- Owner 2026-10-20: a gift received on the profile (notification).
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'gift_received';
