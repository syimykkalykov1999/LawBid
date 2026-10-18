-- Owner 2026-10-18: five wrong bar numbers, then the first lock is exactly
-- one hour (later locks still step up 12 h / 24 h). A value the owner already
-- changed in the admin is left alone: only the old default moves.
UPDATE "app_config" SET "value" = '5'::jsonb WHERE "key" = 'verification.bar_fails_per_step' AND "value" = '3'::jsonb;
