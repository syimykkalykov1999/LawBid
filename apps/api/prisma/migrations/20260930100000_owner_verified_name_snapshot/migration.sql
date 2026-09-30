-- Owner decision 2026-09-30 (OQ-029): name changes never block an
-- attorney; the blue check hides itself when the name drifts far from the
-- verified one. Snapshot the current names of verified attorneys.
ALTER TABLE "attorney_profiles" ADD COLUMN "verified_first_name" STRING;
ALTER TABLE "attorney_profiles" ADD COLUMN "verified_last_name" STRING;
ALTER TABLE "attorney_profiles" ADD COLUMN "name_mismatch" BOOL NOT NULL DEFAULT false;
UPDATE "attorney_profiles" AS a
   SET "verified_first_name" = u."first_name",
       "verified_last_name"  = u."last_name"
  FROM "users" AS u
 WHERE u."id" = a."user_id" AND a."verification_status" = 'verified';
