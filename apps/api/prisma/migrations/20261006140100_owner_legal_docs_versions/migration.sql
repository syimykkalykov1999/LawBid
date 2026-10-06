-- Owner 2026-10-05 (legal documents): drafts, history and rollback.
-- status: draft (version 'draft', one per type + locale) / published (the
-- current version) / archived (a former version, kept for the record of
-- what users accepted). The next migration marks the existing rows.
ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "status" STRING(16) NOT NULL DEFAULT 'draft';
ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "requires_reacceptance" BOOL NOT NULL DEFAULT true;
ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "created_by" UUID;
ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "changed_by" UUID;
ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "change_note" STRING(1000);
ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "rollback_of_id" UUID;

CREATE INDEX IF NOT EXISTS "legal_documents_doc_type_locale_status_idx" ON "legal_documents"("doc_type", "locale", "status");
