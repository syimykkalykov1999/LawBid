-- Owner 2026-10-07: Threads-style reposts — "someone reposted your post".
-- The enum value is added on its own (CockroachDB cannot use a new value
-- in the transaction that adds it).
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'post_repost';
