-- Verify 17.11: the group catch-up reads the messages of one group changed
-- after a time (GroupsService.messagesAfter). Partial: only changed rows,
-- and Prisma leaves it out of its schema diff like the other concurrent
-- indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_group_messages_changed_idx
  ON chat_group_messages (group_id, changed_at)
  WHERE changed_at IS NOT NULL;
