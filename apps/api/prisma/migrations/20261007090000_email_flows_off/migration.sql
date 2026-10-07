-- Owner 2026-10-07: Admin → Система → Функции → «Вход и письма по почте».
-- Amazon SES keeps the account in its sandbox (mail reaches only
-- pre-verified addresses), so every e-mail flow in the app is switched off
-- until production access is granted. One switch: the existing
-- `email_login` flag now covers sign-in, adding an e-mail, the client's
-- e-mail step, the firm e-mail check, e-mail notifications and the
-- country waiting list (apps/api/src/modules/feature-flags/email-flows.ts).
INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('email_login', false, 100, 'E-mail sign-in and every e-mail flow in the app (add e-mail, client e-mail step, firm e-mail, e-mail notifications, waiting list). Off: phone, Google and Apple only.', now())
ON CONFLICT (key) DO UPDATE
SET enabled = false, description = excluded.description, updated_at = now();
