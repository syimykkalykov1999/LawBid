-- Owner 2026-11-09: validate the widened posts_pin_slot_range (1..10) added
-- NOT VALID in 20261127090000_posts_pin_ten (online: the check of existing
-- rows runs under SHARE UPDATE EXCLUSIVE, writes keep going).
SET LOCAL lock_timeout = '5s';

ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_pin_slot_range";
