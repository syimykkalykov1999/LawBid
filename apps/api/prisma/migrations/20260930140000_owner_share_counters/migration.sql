-- Owner decision 2026-09-30 (OQ-037): share counters on posts and cases.
ALTER TABLE "posts" ADD COLUMN "share_count" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "cases" ADD COLUMN "share_count" INT4 NOT NULL DEFAULT 0;

CREATE TABLE "post_shares" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "post_shares_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "post_shares_post_id_idx" ON "post_shares"("post_id");

CREATE TABLE "case_shares" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "case_shares_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_shares_case_id_idx" ON "case_shares"("case_id");
