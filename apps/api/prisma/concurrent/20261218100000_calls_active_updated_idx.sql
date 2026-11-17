-- Audit 17.11 (problem 14): the calls sweep (cron every minute and, while
-- few calls come in, the call requests) looks for talking calls nobody has
-- refreshed for a while — `status = 'active' AND updated_at < $1`
-- (calls.service.ts sweep). (status, created_at) served only the ringing
-- half; this half scanned every active call. Partial on the live status:
-- small (only calls going on now), and out of Prisma's schema diff like the
-- other concurrent indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_active_updated_idx
  ON calls (updated_at)
  WHERE status = 'active';
