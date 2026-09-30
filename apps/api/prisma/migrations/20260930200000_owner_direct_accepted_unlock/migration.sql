-- Owner 2026-09-30 (OQ-043): an accepted message request is a full chat
-- (contacts open, calls allowed) — also for requests accepted earlier.
UPDATE "conversations" SET "contacts_unlocked" = true
  WHERE "case_id" IS NULL AND "request_status" = 'accepted' AND "contacts_unlocked" = false;
