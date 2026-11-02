-- Owner 2026-10-28: up to six pinned posts per profile list (was three).
-- Widens posts_pin_slot_range from 1..3 to 1..6. Expand-only: every row the
-- old check allowed is still allowed, and the running release only ever
-- writes 1..3. The new check is added NOT VALID (no full-table scan under
-- the ACCESS EXCLUSIVE lock) and validated in the next migration
-- (20261109090100_posts_pin_six_validate) under SHARE UPDATE EXCLUSIVE.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "posts" DROP CONSTRAINT "posts_pin_slot_range";

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_pin_slot_range"
  CHECK ("pin_slot" IS NULL OR ("pin_slot" >= 1 AND "pin_slot" <= 6)) NOT VALID;
