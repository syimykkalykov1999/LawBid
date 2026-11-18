-- Verify 5b (17.11): the calls sweep (every minute) looks for ended calls
-- whose end effects never went out — `ended_events_due_at IS NOT NULL AND
-- ended_events_due_at < $1` (calls.service.ts retryEndedEffects). Partial:
-- only the few rows in flight, out of Prisma's schema diff like the other
-- concurrent indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_ended_events_due_idx
  ON calls (ended_events_due_at)
  WHERE ended_events_due_at IS NOT NULL;
