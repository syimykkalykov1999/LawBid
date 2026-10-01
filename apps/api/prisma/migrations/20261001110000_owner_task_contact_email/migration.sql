-- Owner 2026-10-01: email tasks need the address to write to.
ALTER TABLE attorney_tasks ADD COLUMN IF NOT EXISTS contact_email STRING(254);
