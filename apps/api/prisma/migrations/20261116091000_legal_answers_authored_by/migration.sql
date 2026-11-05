SET LOCAL lock_timeout = '5s';

-- R-401 (owner 2026-11-04): an assistant with the «qa_answers» duty answers
-- in the attorney's name; the row keeps who typed it. Expand only, nullable,
-- no default: instant on PostgreSQL.
ALTER TABLE "legal_answers" ADD COLUMN "authored_by_user_id" UUID;
