-- Owner 2026-10-21 (inbox 22c/27): a channel I follow has its own pin,
-- Archive and a timed mute, like a group.
ALTER TABLE "channel_subscriptions" ADD COLUMN "muted_until" TIMESTAMPTZ;
ALTER TABLE "channel_subscriptions" ADD COLUMN "pinned_at" TIMESTAMPTZ;
ALTER TABLE "channel_subscriptions" ADD COLUMN "archived_at" TIMESTAMPTZ;
