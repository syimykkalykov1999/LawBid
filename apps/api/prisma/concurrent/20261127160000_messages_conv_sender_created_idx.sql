-- Row 71 (1B load test 2026-11-13, /data/lt/results/NOTES.md «FINDING grows
-- with data»): the «Отвечает за день» samples of the attorney feed
-- (client-activity.service.ts responseSamplesSql) look up, per attorney
-- message, the client's first later message in the same chat, and scan the
-- attorney's messages of the last 30 days. Without this index both walked
-- every message of that sender in the chat through
-- (conversation_id, sender_id, client_message_id) and filtered created_at:
-- top query of the 1B run (pg_stat_statements mean 816 ms), 1.07 M buffers
-- for one page of 20 clients. With it: two index ranges per message.
-- Partial on `deleted_at IS NULL` (written literally in that raw SQL; also
-- keeps the index out of Prisma's schema diff, like the other concurrent
-- indexes, and deleted rows out of the index).
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_conv_sender_created_idx
  ON messages (conversation_id, sender_id, created_at)
  WHERE deleted_at IS NULL;
