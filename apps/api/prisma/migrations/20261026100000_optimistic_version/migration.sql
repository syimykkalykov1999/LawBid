-- Optimistic concurrency (expand step): a counter on the rows two people can edit.
-- NOT NULL with a constant DEFAULT is metadata-only in Postgres 11+, and the previous
-- release (which ignores the column) keeps working.
ALTER TABLE "cases" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bids" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "client_profiles" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attorney_profiles" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attorney_tasks" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
