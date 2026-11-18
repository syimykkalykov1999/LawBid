-- Verify 5b (17.11): a call's end and its "it is over" effects (call:ended,
-- the stop-ringing / ended push, the chat entry, the missed-call
-- notification) were not atomic — a throw or a crash after the status
-- change lost them, and a retry saw the call as final and did nothing.
-- Set in the SAME statement as the final status, cleared once the effects
-- went out; the calls sweep re-sends for rows left set (calls.service.ts).
-- Additive only: a nullable column is a catalog change, no table rewrite.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "ended_events_due_at" TIMESTAMPTZ;
