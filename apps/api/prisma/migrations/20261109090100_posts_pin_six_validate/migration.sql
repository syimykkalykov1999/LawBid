-- Owner 2026-10-28: validate the widened posts_pin_slot_range (1..6) added
-- NOT VALID in 20261109090000_posts_pin_six (online: the check of existing
-- rows runs under SHARE UPDATE EXCLUSIVE, writes keep going).
SET LOCAL lock_timeout = '5s';

ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_pin_slot_range";
