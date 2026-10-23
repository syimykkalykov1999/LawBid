-- Owner 2026-10-22 (systems checklist §15, §26): the CCPA «Do not sell or
-- share my personal information» consent and the accessibility statement
-- document type. Expand only: two enum values.
ALTER TYPE "consent_type" ADD VALUE IF NOT EXISTS 'do_not_sell';
ALTER TYPE "legal_doc_type" ADD VALUE IF NOT EXISTS 'accessibility';
