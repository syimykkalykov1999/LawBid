-- Perf review 2026-10-26 (R-39): the nightly privacy.retention walked the
-- whole sessions table by primary key to find old sessions that still keep
-- an IP or a browser string. This index holds only those rows, keyed by the
-- immutable created_at (an updated_at key would break HOT updates on a busy
-- table; a session unused for N days was also created more than N days ago).
-- Once blanked a row leaves the index, so it stays small. One statement per
-- file, CONCURRENTLY (no write block); raw SQL only, Prisma does not model
-- partial indexes (like messages_expiry_idx).
CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_net_created_idx
  ON public.sessions USING btree (created_at, id)
  WHERE ip IS NOT NULL OR user_agent IS NOT NULL;
