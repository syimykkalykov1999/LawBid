-- Owner 2026-09-30: calls get their own notification category (incoming
-- call ring push + missed calls), separate from messages.
ALTER TYPE "notification_category" ADD VALUE 'calls';
