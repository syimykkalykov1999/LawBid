SET LOCAL lock_timeout = '5s';
-- Owner 2026-11-02: quick replies for attorneys. Expand-only: a new table
-- nobody reads yet; the running release ignores it.
CREATE TABLE "quick_replies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" VARCHAR(60) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quick_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "quick_replies_user_id_position_created_at_idx" ON "quick_replies"("user_id", "position", "created_at");
