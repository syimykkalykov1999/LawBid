-- Detective R2B-14 (14.11): old unsubscribe links are found by the sha256
-- of their token (migration 20261130120000_outreach_unsubscribe_token_hash).
-- Built online (squawk require-concurrent-index-creation): outreach_leads
-- grows with every registry import. Partial on `IS NOT NULL` (new leads
-- have no hash) — also keeps it out of Prisma's schema diff, like the
-- other concurrent indexes.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "outreach_leads_unsubscribe_token_hash_key"
  ON "outreach_leads" ("unsubscribe_token_hash")
  WHERE "unsubscribe_token_hash" IS NOT NULL;
