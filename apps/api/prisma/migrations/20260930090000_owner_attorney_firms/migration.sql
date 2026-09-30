-- Owner decision 2026-09-30 (OQ-030): an attorney lists several firms.
-- firm_name stays as the first entry (older clients, admin, exports).
ALTER TABLE "attorney_profiles" ADD COLUMN "firm_names" STRING[] NOT NULL DEFAULT ARRAY[]::STRING[];
UPDATE "attorney_profiles" SET "firm_names" = ARRAY["firm_name"] WHERE "firm_name" IS NOT NULL AND "firm_name" <> '';
