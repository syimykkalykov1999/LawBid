-- Verify 17.11: a reaction removed while the other phone was offline reaches
-- it in the 1:1 catch-up (a removal leaves no reaction row to look at).
-- Nullable, no default: instant, also on the partitioned table.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "messages" ADD COLUMN "reactions_changed_at" TIMESTAMPTZ;
