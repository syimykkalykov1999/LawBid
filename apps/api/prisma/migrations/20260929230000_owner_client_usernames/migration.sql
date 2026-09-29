-- Owner decision 2026-09-29 (docs/OPEN_QUESTIONS.md OQ-026): clients are
-- searchable by @username and name, so client_profiles carry a username
-- with the attorney rules. Nullable: existing clients receive one lazily
-- (UsernameRegistry.allocate) the first time their profile is read.
ALTER TABLE "client_profiles" ADD COLUMN "username" STRING;
ALTER TABLE "client_profiles" ADD COLUMN "username_lower" STRING;
ALTER TABLE "client_profiles" ADD COLUMN "username_changed_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX "client_profiles_username_lower_key" ON "client_profiles"("username_lower");

-- People search (docs/05 §7.3 extended to clients): trigram index like the
-- attorney one (docs/02 §5.3), partial on rows that have a username.
CREATE INDEX IF NOT EXISTS "client_profiles_username_trgm_idx"
  ON "client_profiles" USING GIN ("username_lower" gin_trgm_ops)
  WHERE "username_lower" IS NOT NULL;
