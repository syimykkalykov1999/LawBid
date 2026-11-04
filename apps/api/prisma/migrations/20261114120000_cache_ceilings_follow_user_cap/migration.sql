SET LOCAL lock_timeout = '5s';

-- Owner 2026-11-03: the phone's media caches have no per-store ceiling any
-- more; the person's «Максимальный размер кэша» (default 10 GB) governs.
-- The old defaults (images 1000, chat_media 1000, files 500, video 1000 MB)
-- may already be stored in app_config, and a stored row beats the new code
-- default for ever. Reset a key to 0 only where it still holds the OLD
-- default (a number or a numeric string): a value an admin chose on purpose
-- stays.
UPDATE "app_config"
SET "value" = CASE
      WHEN jsonb_typeof("value") = 'string' THEN '"0"'::jsonb
      ELSE '0'::jsonb
    END,
    "updated_at" = now()
WHERE ("key" = 'cache.limit_mb.images' AND "value" IN ('1000'::jsonb, '"1000"'::jsonb))
   OR ("key" = 'cache.limit_mb.chat_media' AND "value" IN ('1000'::jsonb, '"1000"'::jsonb))
   OR ("key" = 'cache.limit_mb.files' AND "value" IN ('500'::jsonb, '"500"'::jsonb))
   OR ("key" = 'cache.limit_mb.video' AND "value" IN ('1000'::jsonb, '"1000"'::jsonb));

-- «Хранить медиа» is replaced by the auto-delete age by scope; the knob is
-- gone from the app and from the admin screen.
DELETE FROM "app_config" WHERE "key" = 'cache.keep_media_days.default';
