-- Owner 2026-10-05: documents (PDF, Word, text) attached to posts and to a
-- reel's inner page. Own migration: CockroachDB can't use an enum value
-- added in the same transaction. Idempotent.
ALTER TYPE file_purpose ADD VALUE IF NOT EXISTS 'post_attachment';
