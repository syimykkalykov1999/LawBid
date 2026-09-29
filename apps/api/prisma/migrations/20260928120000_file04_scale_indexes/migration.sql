-- docs/04 file-04 load review (5k RPS / millions of cases target): indexes
-- for queries added by stages 4.6–4.10. Performance only; no data change.
-- Recorded in docs/OPEN_QUESTIONS.md OQ-011 item 5.

-- §10.2 stale prompt: open cases never prompted, by inactivity. The
-- stage 2.6 cases_open_activity_idx also covers already-prompted rows,
-- which the hourly job would otherwise walk every run.
CREATE INDEX "cases_open_unprompted_idx" ON "cases" ("last_activity_at", "id")
  WHERE "status" = 'open' AND "stale_prompt_sent_at" IS NULL AND "deleted_at" IS NULL;

-- §10.2 auto-archive: prompted open cases, by prompt time.
CREATE INDEX "cases_open_prompted_idx" ON "cases" ("stale_prompt_sent_at", "id")
  WHERE "status" = 'open' AND "stale_prompt_sent_at" IS NOT NULL AND "deleted_at" IS NULL;

-- §11.2 "Мои биды" (finished = several statuses): newest activity first
-- across statuses; bids(attorney_id, status, updated_at) can't serve the
-- sort for an IN list.
CREATE INDEX "bids_attorney_updated_idx" ON "bids" ("attorney_id", "updated_at" DESC, "id" DESC);
