-- Stage 2.6 (docs/02_DATABASE.md §8 "Этап 2.6"): raw SQL that Prisma can't
-- express — computed columns (§5.3), partial / hash-sharded / GIN /
-- trigram / full-text indexes (§5.1–§5.3), DB roles and grants (§6.2–6.3).
-- Prisma's diff ignores partial and inverted indexes, so they don't show
-- up as drift; computed columns are declared in schema.prisma as plain
-- (String? / Unsupported("tsvector")?) read-only fields.

-- ---------------------------------------------------------------------
-- §5.3 computed columns
-- ---------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "full_name_lower" STRING
  AS (lower(COALESCE("first_name", '') || ' ' || COALESCE("last_name", ''))) STORED;
ALTER TABLE "posts" ADD COLUMN "search_tsv" TSVECTOR
  AS (to_tsvector('english', "body")) STORED;
ALTER TABLE "cases" ADD COLUMN "search_tsv" TSVECTOR
  AS (to_tsvector('english', "title" || ' ' || "description")) STORED;

-- ---------------------------------------------------------------------
-- §5.2 partial indexes (replace the plain ones Prisma created earlier)
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS "cases"@"cases_client_id_status_created_at_idx";
DROP INDEX IF EXISTS "cases"@"cases_primary_state_code_practice_area_id_created_at_idx";
DROP INDEX IF EXISTS "sessions"@"sessions_user_id_idx";

-- Attorney case feed (§5.2 / §5.4).
CREATE INDEX "cases_open_feed_idx" ON "cases" ("primary_state_code", "practice_area_id", "created_at" DESC)
  WHERE "status" = 'open' AND "deleted_at" IS NULL;
-- Client "My cases".
CREATE INDEX "cases_client_idx" ON "cases" ("client_id", "status", "created_at" DESC)
  WHERE "deleted_at" IS NULL;
-- Crons: stale prompt / archive, auto-close.
CREATE INDEX "cases_open_activity_idx" ON "cases" ("last_activity_at") WHERE "status" = 'open';
CREATE INDEX "cases_auto_close_idx" ON "cases" ("auto_close_at") WHERE "status" = 'pending_completion';
-- Practice lookup for the §5.4 query (cases by leaf + open).
CREATE INDEX "cases_open_practice_idx" ON "cases" ("practice_area_id", "created_at" DESC)
  WHERE "status" = 'open' AND "deleted_at" IS NULL;

CREATE INDEX "sessions_active_user_idx" ON "sessions" ("user_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "notifications_unread_idx" ON "notifications" ("user_id") WHERE "read_at" IS NULL;
CREATE INDEX "posts_author_published_idx" ON "posts" ("author_id", "created_at" DESC)
  WHERE "status" = 'published' AND "deleted_at" IS NULL;

-- ---------------------------------------------------------------------
-- §1.1 / §5.2 hash-sharded indexes on monotonically increasing columns
-- ---------------------------------------------------------------------
CREATE INDEX "posts_global_feed_idx" ON "posts" ("created_at" DESC)
  USING HASH WITH (bucket_count = 16) WHERE "status" = 'published';
CREATE INDEX "auth_events_created_at_idx" ON "auth_events" ("created_at")
  USING HASH WITH (bucket_count = 16);
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" ("created_at")
  USING HASH WITH (bucket_count = 16);

-- ---------------------------------------------------------------------
-- §5.3 search: trigram, full-text, array GIN
-- ---------------------------------------------------------------------
CREATE INVERTED INDEX "attorney_profiles_username_trgm_idx" ON "attorney_profiles" ("username_lower" gin_trgm_ops);
CREATE INVERTED INDEX "users_full_name_trgm_idx" ON "users" ("full_name_lower" gin_trgm_ops);
CREATE INVERTED INDEX "tags_tag_trgm_idx" ON "tags" ("tag_lower" gin_trgm_ops);
CREATE INVERTED INDEX "posts_search_tsv_idx" ON "posts" ("search_tsv");
CREATE INVERTED INDEX "cases_search_tsv_idx" ON "cases" ("search_tsv");
CREATE INVERTED INDEX "attorney_profiles_languages_idx" ON "attorney_profiles" ("languages");
CREATE INVERTED INDEX "client_profiles_languages_idx" ON "client_profiles" ("preferred_languages");

-- ---------------------------------------------------------------------
-- §6.2 / §6.3 roles. Passwords are never set here: environments set them
-- from Secrets Manager (docs/06). WITH LOGIN so services can connect.
-- lawbid_migrator is the DDL role used by CI/CD migrations.
-- ---------------------------------------------------------------------
CREATE ROLE IF NOT EXISTS "lawbid_migrator" WITH LOGIN;
CREATE ROLE IF NOT EXISTS "lawbid_app" WITH LOGIN;
CREATE ROLE IF NOT EXISTS "lawbid_retention" WITH LOGIN;
CREATE ROLE IF NOT EXISTS "lawbid_readonly" WITH LOGIN;

-- Database-level privileges are environment-specific (the DB name differs
-- per env): CONNECT is granted to `public` by default in CockroachDB, and
-- lawbid_migrator's CREATE on the database is granted by infrastructure
-- (Terraform, docs/06 stage 6.10) — not here.
GRANT ALL ON ALL TABLES IN SCHEMA public TO "lawbid_migrator";

-- App: DML everywhere...
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "lawbid_app";
-- ...but only INSERT/SELECT on append-only tables (§6.2).
REVOKE UPDATE, DELETE ON TABLE "case_journal", "contact_disclosures", "audit_log",
  "data_access_log", "auth_events", "user_consents" FROM "lawbid_app";
-- The app never touches migration bookkeeping.
REVOKE ALL ON TABLE "_prisma_migrations" FROM "lawbid_app";

-- Retention: delete expired journal rows only. The retain_until < now()
-- condition is applied by the monthly job (CockroachDB 24.1 has no
-- row-level security to express it as a grant).
GRANT SELECT, DELETE ON TABLE "case_journal" TO "lawbid_retention";

-- Read-only analytics: everything except tables holding identity
-- documents, contacts, credentials or message bodies.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "lawbid_readonly";
REVOKE SELECT ON TABLE "users", "user_identifiers", "sessions", "auth_events",
  "files", "verification_documents", "contact_disclosures",
  "contact_issue_reports", "messages", "client_profiles", "push_tokens",
  "data_access_requests", "data_access_log", "_prisma_migrations" FROM "lawbid_readonly";
