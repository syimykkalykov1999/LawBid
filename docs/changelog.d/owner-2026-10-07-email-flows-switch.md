## Owner 2026-10-07 — one switch «Вход и письма по почте»

Amazon SES refused production access (the account stays in the sandbox:
mail reaches only pre-verified addresses), so every e-mail flow in the
user app now hangs on ONE switch: Admin → Система → Функции → «Вход и
письма по почте» (flag key `email_login`, kept so the store build already
hides the e-mail button). Migration `20261007090000_email_flows_off` turns
it off.

While it is off:

- Sign-in / sign-up by e-mail and the magic link are refused
  (`AUTH_PROVIDER_DISABLED`, as before); the app shows no e-mail button.
- A client finishes onboarding and posts cases with a verified phone only
  (`missing` has no `email_verified`); the contacts step shows no e-mail
  card. Turning the switch on later asks the e-mail only of clients still
  in onboarding, nobody who finished is sent back.
- Settings → Account: no «Add / change e-mail», no «Add a sign-in
  email»; an e-mail already on the account is shown read-only.
  `POST /users/me/contacts/request` with `type: email` → `FEATURE_DISABLED`.
- Attorney trust: the firm e-mail form is hidden; `POST
  /trust/me/firm-email` → `FEATURE_DISABLED` (staff or the registry
  confirm the firm meanwhile).
- No e-mail notifications (the e-mail switch in notification settings is
  hidden), no new-device e-mail, no data-export e-mail (the link stays in
  the app).
- Country waiting list: the «Tell me when it opens» link is hidden and
  `POST /countries/waitlist` → `FEATURE_DISABLED`; nobody already on the
  list is marked notified while it is off.

Not affected: phone, Google and Apple sign-in, store-reviewer demo codes,
assistant codes, and the admin panel's own staff e-mail login and staff
alerts.

Strings: `email_flows_strings.dart`; other languages in
`tmp-import/email-flows-keys-update.xlsx`.
