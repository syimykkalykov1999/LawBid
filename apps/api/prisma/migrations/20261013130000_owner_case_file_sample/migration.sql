-- Owner 2026-10-13: a file or photo can be a "Sample" (a form to fill, an
-- example of what to send), on a task or on one of its checklist lines.
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "is_sample" BOOL NOT NULL DEFAULT false;
