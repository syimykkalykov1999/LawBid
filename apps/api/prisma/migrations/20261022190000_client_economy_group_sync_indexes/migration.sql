-- Owner 2026-10-22 (client economy plan, package B — groups as chats:
-- deltas instead of reloads). GET /groups?updatedSince reads "my
-- memberships changed since" and "groups changed since"; both get an
-- index so the catch-up after a reconnect is one indexed read per side.
-- Plain CREATE INDEX: Prisma runs a migration in a transaction, where
-- CONCURRENTLY is not allowed.
CREATE INDEX IF NOT EXISTS "chat_groups_updated_at_idx"
  ON "chat_groups" ("updated_at");

CREATE INDEX IF NOT EXISTS "chat_group_members_user_id_updated_at_idx"
  ON "chat_group_members" ("user_id", "updated_at");
