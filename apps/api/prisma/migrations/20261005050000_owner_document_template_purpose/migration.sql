-- Owner 2026-10-05: document templates the admin publishes. Own
-- migration: CockroachDB can't use an enum value added in the same
-- transaction. Idempotent.
ALTER TYPE file_purpose ADD VALUE IF NOT EXISTS 'document_template';
