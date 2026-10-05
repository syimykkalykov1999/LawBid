-- Web client kill switch (owner 2026-10-05: on by default). Website
-- sign-in already exists; switching this off refuses sign-ins and sign-ups
-- that declare deviceInfo.platform = 'web' (data only).
INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('web_client', true, 100, 'Sign-in from the web client (platform = web)', now())
ON CONFLICT (key) DO NOTHING;
