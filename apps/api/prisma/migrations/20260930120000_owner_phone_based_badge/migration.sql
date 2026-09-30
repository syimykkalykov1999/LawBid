-- Owner decision 2026-09-30 (OQ-029 final): name changes never hide the
-- blue check any more; clear flags set by the short-lived automatic rule.
UPDATE "attorney_profiles" SET "name_mismatch" = false WHERE "name_mismatch" = true;
