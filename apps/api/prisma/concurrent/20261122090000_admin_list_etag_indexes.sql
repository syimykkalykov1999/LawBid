-- Speed matrix 2026-11-09 (§3 #4, admin lists with a cheap ETag,
-- common/sync/version-etag.service.ts adminUsers / adminCases): the tag of
-- GET /admin/users and GET /admin/cases is MAX(updated_at) of the live rows,
-- read before the list query so an unchanged list is a 304 with no further
-- work. Without these the MAX() is a full scan of the table. Partial, like
-- the other concurrent indexes, so Prisma leaves them out of its schema diff.
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_live_updated_at_idx
  ON users (updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS cases_live_updated_at_idx
  ON cases (updated_at DESC)
  WHERE deleted_at IS NULL;
