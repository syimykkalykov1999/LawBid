-- Owner 2026-10-05 (attorney trust levels): a client can report an attorney
-- who took money and vanished or used someone else's bar number.
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'fraud';
