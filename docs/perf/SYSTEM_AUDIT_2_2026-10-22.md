# System audit #2: security, reliability, data, product (2026-10-22)

Read-only. Audit #1 (load and cost) is not repeated here. Paths are under `apps/` unless they start with `infra/`, `docs/` or `.github/`.

**Already good:** refresh rotation with reuse detection and logout-all (`api/src/modules/auth/auth.service.ts:747-867`), upload sniffing and ClamAV, Stripe webhook verification, payment idempotency keys, ECS rollback, versioned and replicated S3, log redaction.

## Findings

**1. Admin sign-in is one factor (high, S).** `api/src/modules/admin-auth/admin-auth.service.ts:110-113` says a password *or an emailed code* is enough; the authenticator app is optional. So anyone who controls an admin's mailbox controls the panel, including payroll and changing a user's phone. OWASP ASVS and CISA say privileged accounts must have MFA, preferably phishing-resistant (passkeys) ([CISA](https://www.cisa.gov/resources-tools/resources/phishing-resistant-multi-factor-authentication-mfa-success-story-usdas-fast-identity-online-fido-implementation), [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)). Stripe makes 2FA mandatory for dashboard users. **Fix:** require TOTP for every admin role now and add WebAuthn passkeys later. Drop the "email code alone" sign-in.

**2. Moving money needs no step-up and no second person (high, S–M).** Step-up (`admin-auth.service.ts:932-990`) is checked only in 8 controllers. These have no step-up:
- `admin-payroll.controller.ts:123` `payouts/bulk` (real Stripe transfers);
- `admin-billing.controller.ts:300` refunds;
- `admin-users.controller.ts:153` phone change (an account-takeover path);
- `admin-users.controller.ts:104` bulk user actions.

Stripe and banks use step-up plus dual approval above a set amount ([Stripe team roles](https://docs.stripe.com/get-started/account/teams/roles)). **Fix:** call `assertStepUp` on these endpoints. Add maker-checker approval for bulk payouts and refunds above a limit.

**3. iOS sells digital subscriptions through an in-app Stripe sheet (high, product, M).** `mobile/lib/features/subscription/data/card_collector.dart:66-77` shows the Stripe PaymentSheet inside the app. `docs/store/RELEASE_CHECKLIST.md:120` relies on the US "link out" rule. That rule (3.1.1(a), May 2025) allows a button or link to a web checkout, not a third-party payment sheet inside the app ([Apple guidelines](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase), [summary](https://512pixels.net/2025/05/apple-updates-app-review-guidelines/)). Case payments for legal services are fine (3.1.3(e)). **Fix:** on iOS, open the web checkout in the browser, or use StoreKit. Keep the sheet on Android (US) and on web.

**4. The Bunny webhook trusts a token in the URL (medium, S).** `api/src/modules/posts/bunny-webhook.controller.ts:31-46`. Pino redacts it, but ALB access logs (`infra/modules/alb/main.tf:68`) still record it. Bunny Stream signs webhooks with `X-BunnyStream-Signature`, an HMAC-SHA256 of the raw body ([Bunny](https://docs.bunny.com/developer/webhooks/webhook-security), [Hookdeck](https://hookdeck.com/webhooks/platforms/guide-to-bunny-stream-webhooks-features-and-best-practices); confirm the header in the Bunny dashboard). **Fix:** verify the HMAC and keep the path token only as a fallback.

**5. The Node keep-alive timeout is shorter than the ALB's (medium, S).** `api/src/main.ts:32` sets `keepAliveTimeout = 65 s`, but the ALB `idle_timeout = 300` (`infra/modules/alb/main.tf:67`). The comment has the rule backwards. AWS says the target's timeout must be *longer* than the ALB's, or users get random 502s ([AWS](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html), [explainer](https://www.flightcontrol.dev/docs/troubleshooting/load-balancer-502-keepalive-timeout)). **Fix:** `keepAliveTimeout = 310 s`, with `headersTimeout` set just above it.

**6. Message encryption gaps (medium, M).** `api/src/common/secrets/message-body-cipher.ts`:
- The AAD is a constant, `'messages.body'` (`:8`). Anyone with database write access can move a ciphertext to another message.
- When decryption fails, `open()` silently returns the ciphertext (`:49-52`) and logs nothing. A key removed too early goes unnoticed and users see `enc:v2…`.
- There is no job that re-encrypts messages under a new key, so every old key id must stay forever.
- The keys are environment secrets, not wrapped by KMS.
- Push bodies carry the masked text in plaintext to FCM/APNs (`notifications/push/push-dispatcher.ts:62`).

AWS binds encryption context to each record and wraps keys in KMS ([AWS](https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html#encrypt_context)); WhatsApp decrypts pushes on the device. **Fix:** AAD = `messages.body:<id>` (`v3`), log and return `''` on failure, a re-encryption job, a KMS data key; later, data-only pushes.

**7. The web app's refresh token is in sessionStorage and the CSP allows inline scripts (medium, M).** `mobile/third_party/flutter_secure_storage_web/lib/flutter_secure_storage_web.dart:24` stores the token. `infra/modules/web/main.tf:226` allows `'unsafe-inline'` scripts. Any XSS can therefore steal a 60-day refresh token. OWASP recommends an HttpOnly, Secure, SameSite cookie for the refresh token on web ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage)). **Fix:** web refresh in an HttpOnly cookie on the API origin, and remove `'unsafe-inline'` (use hashes).

**8. Admin CSP and HSTS (medium, S).** `admin/next.config.ts:18` allows `script-src 'unsafe-inline'` in production. `:24` allows `connect-src https:`, so a script could send data to any host. There is no `Strict-Transport-Security` header. Next.js documents nonce-based CSP ([Next.js](https://nextjs.org/docs/app/guides/content-security-policy)). **Fix:** use a nonce from middleware, limit `connect-src` to `'self'` plus the media bucket, and add HSTS.

**9. Backups not proven (high, M).**
- `docs/runbooks/restore-drill.md`: the log has no completed drill.
- `infra/envs/prod/variables.tf:174`: `create_database=false`, so the production database is outside Terraform and its backups cannot be checked here.
- The RDS module defaults to `multi_az=false` (`infra/modules/postgres/main.tf:33`), and the stack never sets it.
- There is no copy of database backups in another region or account.

AWS Well-Architected REL09/REL13 says to test restores regularly and keep backups isolated ([AWS](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_backing_up_data_periodic_recovery_testing_data.html)). **Fix:** run the drill before launch, turn on Multi-AZ, and copy snapshots with AWS Backup to a second account and region.

**10. No staging, no web rollback (medium, M).** Images go straight to the prod gate (`.github/workflows/deploy.yml:13`). `web-deploy.yml` runs `s3 sync --delete` over files with fixed names, so a visit mid-upload can mix new and old code. `rollback.yml` covers only ECS. **Fix:** a small staging or preview environment, and web builds in a folder per version with `index.html` switched last.

**11. Native crashes are invisible (medium, S).** `mobile/lib/core/diagnostics/crash_reporter.dart:65-70` catches only Dart errors. iOS and Android native crashes, ANRs and CallKit/WebRTC crashes are not reported. Builds are also not obfuscated (`ios/fastlane/Fastfile:12`). **Fix:** Firebase Crashlytics (free; the app already uses Firebase) or Sentry, plus `--obfuscate --split-debug-info` with symbol upload.

**12. Text size is capped at 1.1× (medium, a11y, S).** `mobile/lib/app.dart:76-77`. People with low vision cannot read the app. That fails WCAG 1.4.4 and Apple's Dynamic Type guidance ([Apple](https://developer.apple.com/design/human-interface-guidelines/typography#Supporting-Dynamic-Type)). **Fix:** cap at 1.3× for dense cards and leave full scaling for message text.

**13. Push and microphone asked right after sign-in (low–medium, S).** `features/notifications/application/push_service.dart:97,102` asks for both at once with no explanation first. Apple says to ask in context ([Apple](https://developer.apple.com/design/human-interface-guidelines/privacy#Requesting-permission)); a "no" here means missed calls for good. **Fix:** a short explanation screen first, then the microphone at the first call setup.

**14. SEO soft 404s (medium, S).** `infra/modules/web/main.tf:354-365` turns 403/404 into a 200 with `index.html`. A deleted `/attorneys/x` page then looks like a live page, and Google flags soft 404s ([Google](https://developers.google.com/search/docs/crawling-indexing/http-network-errors#soft-404-errors)). **Fix:** use a CloudFront Function to return a real 404 under `/attorneys/*`, `/lawyers/*` and `/practice-areas/*`.

**15. Smaller items (low, S).**
- **Stripe subscription idempotency key:** includes the hour (`billing/stripe-payment.provider.ts:145`), so a retry that crosses the hour creates a second subscription. Stripe advises one key per client attempt ([Stripe](https://docs.stripe.com/api/idempotent_requests)); use the client's `Idempotency-Key`.
- **Login redirect check:** `admin/src/app/login/login-form.tsx:44` accepts `/\evil.com`; also reject `\` ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)).
- **Advisory-only CI checks:** `npm audit` at high severity (`api-ci.yml:290`) and the localization and colour checks (`mobile-ci.yml:93,108`). Make them blocking with an allowlist.

## Do first (ranked)

1. Require TOTP for all admins (#1), S
2. Step-up on payouts, refunds, phone change and bulk actions (#2), S
3. iOS payment flow that follows App Store rules (#3), M, blocks App Review
4. Fix keep-alive 310 s (#5), S
5. Restore drill, Multi-AZ, backups in another account (#9), M
6. Native crash reporting and symbols (#11), S
7. Bunny HMAC verification (#4), S
8. Message cipher: per-row AAD, loud failures (#6 part 1), S
9. Web refresh token in an HttpOnly cookie, remove `unsafe-inline` (#7), M
10. Admin nonce CSP, HSTS, narrower `connect-src` (#8), S
11. Maker-checker for bulk payouts (#2 part 2), M
12. Versioned web deploys and web rollback (#10), S
13. Text scaling up to 1.3× (#12), S
14. Real 404s for SEO pages (#14), S
15. Contextual permission prompts; Stripe key; CI checks blocking (#13, #15), S
