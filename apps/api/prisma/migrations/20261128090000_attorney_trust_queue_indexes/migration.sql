SET LOCAL lock_timeout = '5s';
-- Row 37 (speed everywhere, load copy 2026-11-13, 1 M attorneys, 745 k
-- attorney_trust rows): the staff queue (GET /admin/trust/queue, and
-- /admin/trust/stats which counts it) now asks each queue fact on its own
-- (AttorneyTrustService.queue). payments_hold and bids_hold already have an
-- index; firm_link_status = 'pending' and name_check = 'mismatch' had none:
-- Parallel Seq Scan on attorney_trust, 9 213 buffers, 137 ms each. With
-- these (tried on the load copy in a rolled-back transaction): Index Scan,
-- 0.08 ms. Plain b-tree, not partial: Prisma sends the value as a parameter.
-- ~5 MB each at 745 k rows.
-- Plain CREATE INDEX (Prisma runs a migration in one transaction, where
-- CONCURRENTLY is not allowed), like 20261120090000_partition_ready_journals:
-- attorney_trust is small at launch (one row per attorney; a short SHARE
-- lock on its writes), and an index kept in schema.prisma has no drift.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "attorney_trust_firm_link_status_idx" ON "attorney_trust"("firm_link_status");
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "attorney_trust_name_check_idx" ON "attorney_trust"("name_check");
