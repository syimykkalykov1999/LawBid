-- Owner 2026-10-20 (planner reminders): the person's time zone, and whether
-- a device keeps the planner reminders locally (the server then sends it a
-- data-only reminder the app shows under the same id as its local alarm).
ALTER TABLE "users" ADD COLUMN "timezone" VARCHAR(64);
ALTER TABLE "push_tokens" ADD COLUMN "local_reminders" BOOLEAN NOT NULL DEFAULT false;
