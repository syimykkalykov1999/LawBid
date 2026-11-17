-- DB scale review 14.11 (finding 8): a push / VoIP token pointed at ONE
-- session row — the newest row of the device's sign-in chain at the moment
-- it registered. Every refresh adds a row to the chain; sessions.cleanup
-- removes the old row at its own expiry, and ON DELETE CASCADE took the
-- token with it although the device was still signed in (an iPhone that
-- only wakes for VoIP calls, a phone that refreshes in the background but
-- never registers its token again) — no pushes, no ringing.
--
-- Expand-only: the token row gets the device's sign-in chain
-- (`session_chain_id`, stable across refreshes). The services match devices
-- and check liveness by it, and every refresh moves `session_id` to the new
-- row (SessionService.rotate), so the cascade now fires only when the whole
-- chain ends. The running release ignores the new nullable column.
-- Existing rows are filled and moved in 20261128140100.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "push_tokens" ADD COLUMN "session_chain_id" UUID;
ALTER TABLE "voip_tokens" ADD COLUMN "session_chain_id" UUID;
