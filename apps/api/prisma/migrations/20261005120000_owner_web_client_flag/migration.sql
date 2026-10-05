-- Future web client (client form on lawbid.dev): sign-ins and sign-ups
-- that declare deviceInfo.platform = 'web' are refused while this is off
-- (data only).
INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('web_client', false, 100, 'Sign-in from the web client (platform = web)', now())
ON CONFLICT (key) DO NOTHING;
