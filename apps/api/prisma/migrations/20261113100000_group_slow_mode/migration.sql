SET LOCAL lock_timeout = '5s';
-- Owner 2026-11-02: slow mode in groups (Telegram). Expand-only: a nullable
-- column without a default (no table rewrite); the running release ignores it.
ALTER TABLE "chat_groups" ADD COLUMN "slow_mode_s" INTEGER;
