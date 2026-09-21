-- Stage 1.4: add sessions.session_chain_id (docs/CHANGELOG.md has the full
-- rationale). Hand-written rather than `prisma migrate diff` because that
-- mode needs a shadow database and this change is a single column + index
-- -- simple enough to write and read directly.
--
-- NOT NULL with no default: safe only because no session ever existed in a
-- real deployment before this stage (the only rows CockroachDB has seen so
-- far were in a throwaway local verification instance, since discarded).
-- If this repo ever has real session rows before this migration ships,
-- it needs a backfill step first (expand/contract, docs/02_DATABASE.md
-- §7.1) -- add one then, don't edit this file per .cursorrules.
ALTER TABLE "sessions" ADD COLUMN "session_chain_id" UUID NOT NULL;

CREATE INDEX "sessions_session_chain_id_idx" ON "sessions"("session_chain_id");
