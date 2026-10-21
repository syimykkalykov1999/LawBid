-- Owner 2026-10-21 (inbox 26b): who publishes in a channel — the admins
-- (default) or every subscriber.
ALTER TABLE "channels" ADD COLUMN "who_can_post" VARCHAR(8) NOT NULL DEFAULT 'admins';
