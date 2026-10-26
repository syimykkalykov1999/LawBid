-- Owner 2026-10-23: expand-only. A call with one person left must end after
-- a short grace (`calls.solo_end_seconds`). `solo_since` is when the second
-- to last person left; null = not alone. Nullable column, no default, no
-- rewrite of the table.
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "solo_since" TIMESTAMPTZ;
