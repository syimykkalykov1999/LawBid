-- Owner 2026-10-20 (case tools): the journal records a signature being
-- requested / given / completed / declined and an invoice being issued.
-- Enum values in their own migration: a new value cannot be used in the
-- transaction that adds it.
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'signature_requested';
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'signature_signed';
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'signature_completed';
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'signature_declined';
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'invoice_issued';
