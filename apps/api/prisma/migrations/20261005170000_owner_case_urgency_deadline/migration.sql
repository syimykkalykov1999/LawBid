-- Owner 2026-10-05: case urgency as a level or a concrete date. New
-- levels (within_month, very_urgent) and `by_date`, which keeps the date
-- in deadline_at and what it is in deadline_kind. Additive: existing
-- flexible / soon / urgent values stay valid.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deadline_at DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deadline_kind STRING;
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_urgency_check;
ALTER TABLE cases ADD CONSTRAINT cases_urgency_check
  CHECK (urgency IS NULL OR urgency IN
    ('flexible', 'within_month', 'soon', 'urgent', 'very_urgent', 'by_date'));
ALTER TABLE cases ADD CONSTRAINT cases_deadline_check
  CHECK (CASE WHEN urgency = 'by_date' THEN deadline_at IS NOT NULL
              ELSE deadline_at IS NULL END);
ALTER TABLE cases ADD CONSTRAINT cases_deadline_kind_check
  CHECK (deadline_kind IS NULL OR (deadline_at IS NOT NULL AND deadline_kind IN
    ('court_hearing', 'filing_deadline', 'meeting', 'signing', 'other')));
CREATE INDEX IF NOT EXISTS cases_deadline_at_idx ON cases (deadline_at);

-- Attorneys may limit new-case alerts to urgent cases.
ALTER TABLE attorney_profiles
  ADD COLUMN IF NOT EXISTS new_case_alerts_urgent_only BOOL NOT NULL DEFAULT false;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_deadline_soon';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_deadline_today';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_deadline_passed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_deadline_changed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_urgent_case';
