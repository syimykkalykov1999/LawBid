SET LOCAL lock_timeout = '5s';
-- Batch E (14.11): billing.verification-loss (every 10 minutes) read every
-- rejected / suspended attorney — a list that only grows — and checked
-- each one. It now reads only those whose profile row changed since its
-- last run (verification-loss-billing.job.ts, watermark on updated_at):
--   verification_status IN (...) AND updated_at >= $1 ORDER BY user_id
-- Without an index that is a Seq Scan of attorney_profiles every run. Plain
-- b-tree with the enum as a key column, not a partial index on it: Prisma
-- sends the statuses as a parameter (CAST($1 AS "VerificationStatus"[])),
-- which never matches a partial predicate (KNOWN_ERRORS №118).
-- Plain CREATE INDEX (Prisma runs a migration in one transaction, where
-- CONCURRENTLY is not allowed), like 20261128090000_attorney_trust_queue_indexes:
-- attorney_profiles is small at launch (one row per attorney; a short SHARE
-- lock on its writes), and an index kept in schema.prisma has no drift.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "attorney_profiles_verification_status_updated_at_idx" ON "attorney_profiles"("verification_status", "updated_at");
