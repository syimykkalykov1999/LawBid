-- Owner 2026-10-06: back to the original rule — an attorney is reviewed
-- only by a client who completed a case with them (the review is tied to
-- that case). Reviews written without a case under the 2026-10-01 "anyone
-- reviews" rule are hidden, not deleted: staff can still see and restore
-- them in admin moderation. Client reviews are unchanged (anyone).
UPDATE "reviews"
SET "status" = 'hidden', "updated_at" = now()
WHERE "case_id" IS NULL AND "status" = 'published';

-- Same expression as review-rating.ts (RATING_AVG_SQL); the nightly
-- rating reconcile job would converge on these values too.
UPDATE "attorney_profiles" AS ap
SET ("rating_avg", "rating_count", "updated_at") = (
  SELECT COALESCE(round(avg(r."rating")::DECIMAL, 2), 0), count(r."id"), now()
  FROM "reviews" AS r
  WHERE r."attorney_id" = ap."user_id" AND r."status" = 'published'
)
WHERE ap."user_id" IN (SELECT DISTINCT "attorney_id" FROM "reviews" WHERE "case_id" IS NULL);
