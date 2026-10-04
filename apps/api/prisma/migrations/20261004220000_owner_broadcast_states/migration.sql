-- Owner 2026-10-04: a broadcast can target any set of states.
ALTER TABLE "admin_broadcasts" ADD COLUMN "state_codes" STRING[] NOT NULL DEFAULT ARRAY[]::STRING[];
UPDATE "admin_broadcasts" SET "state_codes" = ARRAY["state_code"] WHERE "state_code" IS NOT NULL;
