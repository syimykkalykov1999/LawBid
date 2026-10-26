-- Owner 2026-10-25 (legal texts, P-TEXT): three new legal document types.
-- Enum values in their own migration: they cannot be used in the
-- transaction that adds them.
ALTER TYPE "legal_doc_type" ADD VALUE IF NOT EXISTS 'community_guidelines';
ALTER TYPE "legal_doc_type" ADD VALUE IF NOT EXISTS 'advertising_disclosure';
ALTER TYPE "legal_doc_type" ADD VALUE IF NOT EXISTS 'sms_terms';
