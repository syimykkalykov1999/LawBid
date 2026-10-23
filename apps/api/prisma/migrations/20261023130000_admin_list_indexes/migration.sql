-- Owner 2026-10-23 (admin economy pass): expand-only. The admin lists page
-- newest-first by (created_at, id) with an optional status filter and
-- search; at hundreds of thousands of rows every one of them needs an index
-- that returns the rows already in that order (otherwise the database sorts
-- the whole table for each page). Plain CREATE INDEX: Prisma runs a
-- migration in a transaction, where CONCURRENTLY is not allowed.

-- Cases (admin «Дела»), bids («Ставки»), subscriptions («Подписки»),
-- payments («Платежи»): newest first, optionally by status.
CREATE INDEX IF NOT EXISTS "cases_created_at_id_idx"
  ON "cases" ("created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "cases_status_created_at_id_idx"
  ON "cases" ("status", "created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "bids_created_at_id_idx"
  ON "bids" ("created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "bids_status_created_at_id_idx"
  ON "bids" ("status", "created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "subscriptions_created_at_id_idx"
  ON "subscriptions" ("created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "subscriptions_status_created_at_id_idx"
  ON "subscriptions" ("status", "created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "payments_created_at_id_idx"
  ON "payments" ("created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "payments_status_created_at_id_idx"
  ON "payments" ("status", "created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "case_disputes_status_created_at_id_idx"
  ON "case_disputes" ("status", "created_at" DESC, "id" DESC);

-- Audit log: the newest page, one object's history, an action prefix
-- (`action LIKE 'x%'` needs text_pattern_ops; raw, partial for the same reason).
CREATE INDEX IF NOT EXISTS "audit_log_created_at_id_idx"
  ON "audit_log" ("created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "audit_log_target_idx"
  ON "audit_log" ("target_type", "target_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_log_action_idx"
  ON "audit_log" ("action" text_pattern_ops, "created_at" DESC)
  WHERE "action" IS NOT NULL;

-- Search boxes. `email ILIKE '%x%'` (subscriptions, support) and a ban value
-- `ILIKE` read every row without a trigram index (40 ms at 100 000 users,
-- ~0.4 s at a million). Raw SQL (partial, like users_full_name_trgm_idx:
-- Prisma does not model these operator classes, and `migrate diff` ignores
-- partial indexes).
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx"
  ON "users" USING gin ("email" public.gin_trgm_ops) WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "account_bans_value_trgm_idx"
  ON "account_bans" USING gin ("value" public.gin_trgm_ops) WHERE "value" IS NOT NULL;

-- The sidebar badge «непрочитанные обращения» counts exactly these rows.
CREATE INDEX IF NOT EXISTS "support_tickets_unread_idx"
  ON "support_tickets" ("id") WHERE "unread_by_admin" = true AND "status" <> 'closed';
