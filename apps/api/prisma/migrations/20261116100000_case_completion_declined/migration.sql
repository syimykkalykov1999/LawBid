SET LOCAL lock_timeout = '5s';
-- R-392 (owner 2026-11-04): «Не закрывать» — the other side keeps a case in
-- work after a close request. Enum value in its own migration: it cannot be
-- used in the transaction that adds it.
ALTER TYPE "case_journal_event" ADD VALUE IF NOT EXISTS 'completion_declined';
