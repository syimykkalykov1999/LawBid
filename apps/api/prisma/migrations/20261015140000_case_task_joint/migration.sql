-- Owner 2026-10-15: a task of both sides of a case («joint»): either side
-- ticks it, and the client may add it too.
ALTER TABLE "case_tasks" DROP CONSTRAINT "case_tasks_kind_valid";
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_kind_valid"
  CHECK (kind = ANY (ARRAY['shared'::text, 'for_client'::text, 'joint'::text]));
