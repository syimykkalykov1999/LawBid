-- Same as messages_expiry_idx, for group messages.
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_group_messages_expiry_idx
  ON public.chat_group_messages USING btree (expires_at)
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;
