-- This is an empty migration.


-- docs/02_DATABASE.md §4.D / §5.1: exactly one primary state per case
-- (partial UQ). Max 3 rows and "at least one primary" are enforced by
-- validateCaseStates() in the case domain (no triggers on CockroachDB 24.1).
CREATE UNIQUE INDEX "case_states_one_primary_uq" ON "case_states"("case_id") WHERE "is_primary";
