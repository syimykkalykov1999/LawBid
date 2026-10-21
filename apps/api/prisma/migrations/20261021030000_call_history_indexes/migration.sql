-- Owner 2026-10-21: the «Calls» tab reads a person's calls newest first.
CREATE INDEX "calls_caller_id_created_at_id_idx" ON "calls"("caller_id", "created_at" DESC, "id" DESC);
CREATE INDEX "calls_callee_id_created_at_id_idx" ON "calls"("callee_id", "created_at" DESC, "id" DESC);
