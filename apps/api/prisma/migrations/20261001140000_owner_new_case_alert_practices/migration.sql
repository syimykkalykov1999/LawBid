-- Owner 2026-10-01: an attorney picks which qualifications send "new
-- case" alerts. false = the profile's qualifications (the default).
ALTER TABLE attorney_profiles ADD COLUMN IF NOT EXISTS new_case_alerts_custom BOOL NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS new_case_alert_practices (
  attorney_id UUID NOT NULL,
  practice_area_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT new_case_alert_practices_pkey PRIMARY KEY (attorney_id, practice_area_id),
  CONSTRAINT new_case_alert_practices_attorney_fkey FOREIGN KEY (attorney_id) REFERENCES attorney_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT new_case_alert_practices_area_fkey FOREIGN KEY (practice_area_id) REFERENCES practice_areas(id) ON DELETE CASCADE,
  INDEX new_case_alert_practices_area_idx (practice_area_id, attorney_id)
);
