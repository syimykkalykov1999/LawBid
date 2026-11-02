-- post_view_events had no index starting with created_at, so the nightly
-- retention (`created_at < cutoff`) read the whole table and the online
-- partition runner (batched copy by created_at) refused to start. A plain
-- index on created_at fixes both.
--
-- One statement per migration file and CONCURRENTLY: it builds without
-- blocking writes (a multi-statement file runs in a transaction, where
-- CONCURRENTLY is refused). If a build is interrupted, drop the INVALID
-- index (`\d post_view_events`) and run `prisma migrate resolve` + deploy.
CREATE INDEX CONCURRENTLY IF NOT EXISTS post_view_events_created_idx
  ON public.post_view_events USING btree (created_at);
