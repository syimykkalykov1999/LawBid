-- Owner 2026-10-04: the client's optional case cover (an app cover
-- variant `art:0..3` or an icon avatar `icon:<name>`, never a personal
-- photo) and how urgent the case is. Additive and nullable: older cases
-- get a cover picked from their id and show no urgency.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cover_key STRING;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS urgency STRING;
ALTER TABLE cases ADD CONSTRAINT cases_cover_key_check
  CHECK (cover_key IS NULL OR cover_key ~ '^(art:[0-3]|icon:[a-z_]{2,32})$');
ALTER TABLE cases ADD CONSTRAINT cases_urgency_check
  CHECK (urgency IS NULL OR urgency IN ('flexible', 'soon', 'urgent'));
