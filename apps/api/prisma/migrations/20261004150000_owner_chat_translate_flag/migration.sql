-- Owner 2026-10-04: the chat "Translate" button, off until the owner saves
-- the Google key in the admin and turns the flag on (data only).
INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('chat_translate', false, 100, 'Translate button under chat messages (Google Translate)', now())
ON CONFLICT (key) DO NOTHING;
