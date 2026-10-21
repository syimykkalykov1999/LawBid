-- Owner 2026-10-21 (inbox 22c / 27, Telegram): a subscriber's own settings
-- of a channel — mute until a moment, pin, archive (the Channels section's
-- own archive) and «read up to» for the unread count.
ALTER TABLE "channel_subscriptions"
  ADD COLUMN "muted_until" TIMESTAMPTZ,
  ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMPTZ,
  ADD COLUMN "last_read_at" TIMESTAMPTZ;
