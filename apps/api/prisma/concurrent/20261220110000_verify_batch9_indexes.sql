-- Verify 17.11, batch 9 (payments, reviews and trust, firms).
-- Partial on a column that is never NULL, like the other concurrent
-- indexes, so Prisma leaves it out of its schema diff; every query below
-- compares client_id with a value, so the planner uses it.
--
-- Every reviews page (reviews.service extras/present: the author's count
-- of published reviews) runs GROUP BY client_id WHERE client_id IN (…)
-- AND status = 'published', and a case review checks the client's other
-- review of that attorney (client_id, attorney_id). The only index on
-- client_id was the partial open-review unique key (case_id IS NULL), so
-- each page opened was a sequential scan of reviews.
CREATE INDEX CONCURRENTLY IF NOT EXISTS reviews_client_attorney_status_idx
  ON reviews (client_id, attorney_id, status)
  WHERE client_id IS NOT NULL;
