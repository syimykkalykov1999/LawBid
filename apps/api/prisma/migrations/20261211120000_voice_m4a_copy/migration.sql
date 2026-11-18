-- Owner row 146: a browser voice note (Opus in WebM) gets an AAC/M4A copy
-- next to it (`<s3_key>.m4a`); true once that copy is stored.
-- Additive only: a constant default is a catalog change (PostgreSQL 11+),
-- no table rewrite.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "voice_m4a" BOOLEAN NOT NULL DEFAULT false;
