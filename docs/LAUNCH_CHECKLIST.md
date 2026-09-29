# Launch checklist (docs/06 §11)

Owner-owned: every box below is ticked by the owner, not by CI. Stage
6.12 delivered the tooling behind each line; the items that need real
accounts (AWS, CockroachDB Cloud, Stripe live, stores) are open.

## 11.1 Readiness

- [ ] All stages of files 1–6 closed; critical e2e green
      (`npm run test:e2e --workspace apps/api` — 49 suites incl.
      `authz-matrix`, `security-hardening`, `auth-hardening`, `files`,
      `security-contact-leak`, `stage-6-9`; `flutter test` — 642 tests).
- [ ] Load test passed (docs/06 §9.4): `k6 run -e STAGE=peak apps/api/k6/all.js`
      and `-e STAGE=soak` on production-sized staging, results in
      `docs/perf/README.md`.
- [ ] Backup restored in a test environment
      (`docs/runbooks/restore-drill.md`, first row filled).
- [ ] Penetration test: critical and high findings fixed
      (docs/06 §9.3 automated suites are the baseline; the external pentest
      report is filed under `docs/security/`).
- [ ] Legal documents reviewed by counsel and uploaded (admin → Legal;
      docs/06 §2.3 п.10) — Terms, Privacy Policy (incl. CCPA and the
      5-year journal retention, docs/01 §10.7), «не юридическая фирма».
- [ ] Stripe: live keys in Secrets Manager (`STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`), live Price $399 (`STRIPE_PRICE_ID`), live
      webhook endpoint `POST /webhooks/stripe`, one real test subscription
      completed and refunded.
- [ ] Twilio (Verify / messaging service), SES (domain verified, out of
      the sandbox, DMARC published — `terraform output ses_dns`), FCM
      (project + service account), Apple / Google sign-in configured for
      prod bundle ids.
- [ ] Alerts and runbooks on: SNS subscriptions confirmed
      (`alert_emails`, Slack webhook), each alarm fired once in a test
      (see `docs/runbooks/README.md`), on-call person named.
- [ ] Feature flags: paid features off — `stripe_identity`,
      `persona_verification`, `profile_promotion`, `video_posts`;
      `auto_bar_check` per the owner's decision (admin → Flags).

## 11.2 Closed beta

- [ ] TestFlight + Google Play Internal/Closed testing group chosen by the
      owner; builds from `mobile-release.yml` with `upload=true`.
- [ ] Sentry (API) and Crashlytics/Sentry (mobile) receiving events from
      the beta builds; triage owner named.
- [ ] Beta exit criteria: no open critical/high bugs for 7 days, the
      critical flows of docs/06 §9.2 exercised by real users on iOS and
      Android.

## 11.3 Store data

- [ ] Apple: Sign in with Apple (present), in-app account deletion
      (Settings → Delete account), Privacy Nutrition Labels, Privacy Policy
      + Terms URLs, «not a law firm» disclaimer in the description.
- [ ] Google Play: Data Safety form, account-deletion URL
      (in-app + the web form), Privacy Policy URL.

## 11.4 Store payment decision

- [ ] Owner confirms the subscription payment method for the stores
      (Stripe as built, or in-app purchases via a second `PaymentProvider`
      implementation, docs/06 §1.8) **before** submission.
