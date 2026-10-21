-- The sweep reads only messages that still wait to expire; the index holds
-- just those (almost every row has expires_at NULL). One statement per file,
-- CONCURRENTLY.
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_expiry_idx
  ON public.messages USING btree (expires_at)
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;
