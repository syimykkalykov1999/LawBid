-- Owner 2026-10-21 (inbox 20e, Telegram «Видеочат»): a call that belongs to
-- a channel (started by its owner / admins, subscribers join freely).
ALTER TABLE "calls" ADD COLUMN "channel_id" UUID;

CREATE INDEX "calls_channel_id_status_idx" ON "calls"("channel_id", "status");
