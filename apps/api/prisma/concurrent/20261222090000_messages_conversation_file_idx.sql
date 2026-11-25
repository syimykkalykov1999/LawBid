-- Pack B (25.11, ROUND2 #14): the chat storage check (FilesService.chatUsage,
-- before every photo, file and voice note of a chat) summed the files of a
-- chat by reading ALL its messages: no index had conversation_id together
-- with file_id. This one holds only the messages that carry a file, so the
-- check reads that chat's files and nothing else. Partial on
-- "file_id IS NOT NULL", like the other concurrent indexes, so Prisma leaves
-- it out of its schema diff; not unique, so it never blocks the hash
-- partitioning of messages by conversation_id.
-- EXPLAIN (ANALYZE, BUFFERS), PostgreSQL 16, local copy, one chat with
-- 100 000 text messages and 200 files: 1 860 buffers / 7.2 ms before,
-- 156 buffers / 0.25 ms with this index (an index-only scan of the chat's
-- 200 file rows); before, the read grew with every file message.
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_conversation_file_idx
  ON messages (conversation_id, file_id) WHERE file_id IS NOT NULL;
