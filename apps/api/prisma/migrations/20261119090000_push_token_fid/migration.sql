SET LOCAL lock_timeout = '5s';
-- 2026-11-07: FCM HTTP v1 deprecates `message.token` in favour of
-- `message.fid` (Firebase Installation ID). Additive: every existing row
-- stays a legacy registration token; new app versions register an FID.
ALTER TABLE "push_tokens" ADD COLUMN "token_kind" TEXT NOT NULL DEFAULT 'token';
