-- Owner 2026-10-05 (legal documents): existing rows keep their meaning —
-- the current ones are published, other published ones archived,
-- unpublished ones stay drafts. (Separate from ADD COLUMN: CockroachDB
-- cannot backfill a column in the transaction that adds it.)
UPDATE "legal_documents" SET "status" = 'published' WHERE "is_current" = true;
UPDATE "legal_documents" SET "status" = 'archived' WHERE "is_current" = false AND "published_at" IS NOT NULL;
