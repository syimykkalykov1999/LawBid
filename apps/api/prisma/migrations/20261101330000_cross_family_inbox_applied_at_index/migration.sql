-- DB-ops hardening S5-3: the retention sweep removes cross_family_inbox rows
-- by age (30 days); without an index each batch would scan the whole table.
-- applied_at only grows, so the index is an append at the right edge (cheap).
CREATE INDEX IF NOT EXISTS "cross_family_inbox_applied_at_idx" ON "cross_family_inbox"("applied_at");
