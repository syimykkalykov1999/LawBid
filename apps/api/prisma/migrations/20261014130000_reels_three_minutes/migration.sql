-- Owner 2026-10-14: reels as long as Instagram's. A row the owner already
-- changed in the admin is left alone: only the old defaults move.
UPDATE "app_config" SET "value" = '180'::jsonb WHERE "key" = 'video.max_duration_sec' AND "value" = '90'::jsonb;
UPDATE "app_config" SET "value" = '1000'::jsonb WHERE "key" = 'video.max_size_mb' AND "value" = '500'::jsonb;
UPDATE "app_config" SET "value" = '900'::jsonb WHERE "key" = 'video.max_source_duration_sec' AND "value" = '180'::jsonb;
