-- Owner 2026-10-22 (client economy plan, package E — cases, bids,
-- consultations: deltas and events instead of reloads). The
-- `?updatedSince` catch-up of "my cases", "my consultations" and "my
-- invites" reads "rows of mine changed since" through these indexes
-- (bids already have bids_attorney_updated_idx). Plain CREATE INDEX:
-- Prisma runs a migration in a transaction, where CONCURRENTLY is not
-- allowed.
CREATE INDEX IF NOT EXISTS "cases_client_id_updated_at_idx"
  ON "cases" ("client_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "consultations_attorney_id_updated_at_idx"
  ON "consultations" ("attorney_id", "updated_at");

CREATE INDEX IF NOT EXISTS "consultations_client_id_updated_at_idx"
  ON "consultations" ("client_id", "updated_at");

CREATE INDEX IF NOT EXISTS "case_invites_attorney_updated_idx"
  ON "case_invites" ("attorney_id", "updated_at");
