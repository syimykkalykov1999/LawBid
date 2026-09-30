-- Owner decision 2026-09-30 (OQ-038): client profile like Instagram —
-- posts, followers, following counters; attorneys' reviews of clients.
ALTER TABLE "client_profiles"
  ADD COLUMN "posts_count" INT4 NOT NULL DEFAULT 0,
  ADD COLUMN "followers_count" INT4 NOT NULL DEFAULT 0,
  ADD COLUMN "following_count" INT4 NOT NULL DEFAULT 0,
  ADD COLUMN "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN "rating_count" INT4 NOT NULL DEFAULT 0;

-- Clients already follow attorneys: backfill their following counter.
UPDATE "client_profiles" AS c SET "following_count" =
  (SELECT count(*) FROM "follows" f WHERE f."follower_id" = c."user_id");

CREATE TABLE "client_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL REFERENCES "cases"("id") ON DELETE RESTRICT,
  "attorney_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "client_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "rating" INT2 NOT NULL,
  "body" STRING,
  "status" "review_status" NOT NULL DEFAULT 'published',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "client_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "client_reviews_body_len" CHECK ("body" IS NULL OR char_length("body") <= 2000)
);
CREATE UNIQUE INDEX "client_reviews_case_id_attorney_id_key" ON "client_reviews"("case_id", "attorney_id");
CREATE INDEX "client_reviews_client_id_created_at_idx" ON "client_reviews"("client_id", "created_at" DESC);
