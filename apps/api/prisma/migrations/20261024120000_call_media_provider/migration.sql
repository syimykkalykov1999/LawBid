-- Owner 2026-10-24: expand-only. Which transport carries a call's media:
-- 'p2p' (device to device, the old behaviour for every existing row) or
-- 'cloudflare' (Cloudflare Realtime SFU, group calls). Constant default, so
-- Postgres 11+ adds the column without rewriting the table.
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "media_provider" VARCHAR(16) NOT NULL DEFAULT 'p2p';
