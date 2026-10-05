-- Owner 2026-10-04: a dispute was opened on the case / support decided it.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_disputed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dispute_resolved';
