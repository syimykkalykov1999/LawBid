-- Owner decision 2026-09-29 (docs/OPEN_QUESTIONS.md OQ-028): a block
-- system for every user. One row per (blocker, blocked).
CREATE TABLE "user_blocks" (
  "blocker_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id")
);
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");
