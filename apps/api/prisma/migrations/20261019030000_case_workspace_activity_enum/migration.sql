-- Audit 2026-10-19: what one side adds in a case in work (an update, a
-- task, a done mark, files, the client's private details) reaches the
-- other side. Enum value in its own migration: a new value cannot be used
-- in the transaction that adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'case_workspace_activity';
