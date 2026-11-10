-- Owner 2026-11-09: up to ten pinned posts per profile list (was six).
-- Widens posts_pin_slot_range from 1..6 to 1..10. Expand-only: every row the
-- old check allowed is still allowed, and the running release only ever
-- writes 1..6. Added NOT VALID (no full-table scan under the ACCESS
-- EXCLUSIVE lock) and validated in 20261127090100_posts_pin_ten_validate.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "posts" DROP CONSTRAINT "posts_pin_slot_range";

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_pin_slot_range"
  CHECK ("pin_slot" IS NULL OR ("pin_slot" >= 1 AND "pin_slot" <= 10)) NOT VALID;
