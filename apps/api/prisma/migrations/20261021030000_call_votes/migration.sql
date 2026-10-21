-- Owner 2026-10-21: vote to remove a member from a group call.
CREATE TABLE IF NOT EXISTS "call_votes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "call_id" UUID NOT NULL,
  "target_id" UUID NOT NULL,
  "started_by_id" UUID NOT NULL,
  "ballots" JSONB NOT NULL DEFAULT '{}',
  "status" VARCHAR(8) NOT NULL DEFAULT 'open',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "call_votes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "call_votes_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "call_votes_call_id_status_idx" ON "call_votes" ("call_id", "status");
