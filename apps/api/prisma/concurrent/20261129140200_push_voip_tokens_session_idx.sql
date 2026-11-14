-- DB scale review 14.11 (finding 1): push_tokens.session_id and
-- voip_tokens.session_id carry a foreign key to sessions with no index, so
-- every deleted session row (sign-out, sessions.cleanup every night, reuse
-- detection) made Postgres read BOTH token tables in full to find the
-- referencing rows (the FK action query `WHERE session_id = $1`). Also used
-- by the move of a device's tokens on every refresh (SessionService.rotate,
-- 20261128140000) and the «iPhone rang by VoIP» match (voip-tokens.service
-- fcmTokensCoveredBy). Partial on `session_id IS NOT NULL` like the other
-- concurrent indexes (keeps it out of Prisma's schema diff); the FK query
-- and every lookup compare with a value, so they match the predicate.
CREATE INDEX CONCURRENTLY IF NOT EXISTS push_tokens_session_id_idx
  ON push_tokens (session_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS voip_tokens_session_id_idx
  ON voip_tokens (session_id)
  WHERE session_id IS NOT NULL;
-- The «iPhone rang by VoIP» match finds push tokens by the device's
-- sign-in chain without the account id (voip-tokens.service).
CREATE INDEX CONCURRENTLY IF NOT EXISTS push_tokens_session_chain_id_idx
  ON push_tokens (session_chain_id)
  WHERE session_chain_id IS NOT NULL;
