-- Verify batch 11 (D11, D12): staff_review_samples had indexes only on
-- (decision_kind, item_id), (status, created_at) and (reviewer_id, status).
-- Partial, like the other concurrent indexes, so Prisma leaves them out of
-- its schema diff; each predicate is implied by its query's WHERE.
--
-- D11, «Следующий» (staff-desk/golden-tasks.service.ts pick / resolve): the
-- golden task waiting for THIS person — every golden row of the kind ever
-- written was read to find the few pending ones.
CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_review_samples_golden_pending_idx
  ON staff_review_samples (decided_by, decision_kind, created_at)
  WHERE status = 'pending' AND is_golden = true;
-- D11, the nightly golden pool (staff-rating/staff-sampling.service.ts):
-- the newest confirmed decisions of one kind.
CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_review_samples_pool_done_idx
  ON staff_review_samples (decision_kind, done_at DESC)
  WHERE status = 'done' AND verdict = 'same' AND is_golden = false;
-- D12, the nightly day stats (staff-rating/staff-daily-stats.service.ts):
-- samples finished inside the day — a range on done_at instead of every
-- done sample ever.
CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_review_samples_done_at_idx
  ON staff_review_samples (done_at)
  WHERE status = 'done';
