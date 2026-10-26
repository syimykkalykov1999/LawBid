# Внешние поставщики: что где, что сломается, как уйти

## Резюме для владельца (по-русски)

Здесь список всех чужих сервисов, на которых стоит LawBid (AWS, Cloudflare, Stripe,
Twilio, Bunny и т.д.): зачем каждый нужен, где смотреть его страницу аварий, что
перестанет работать, если он упадёт или заблокирует нас, и как мы уходим.
Главное: у каждого сервиса есть «выключатель» в админке или в настройках, а
данные можно вывезти. Самые больные места: **AWS** (всё живёт там) и **Stripe**
(деньги). Для остальных есть запасной путь или потеря ограничена одной функцией.
Страницы статуса проверяйте руками: ссылки могли поменяться.

---

How to read: **Down** = the vendor has an outage. **Ban** = the vendor suspends or
closes our account (the worse case: no ETA, may need a lawyer). **Fallback today** is what
exists in code now, not what we could build. **Exit** is the plan for a stressed exit
(vendor gone fast) and a planned exit (we choose to leave).

Method: the stressed/planned exit split, triggers, alternative provider, data
portability and a tested plan are the elements recurring in exit-plan guidance
(EU DORA Article 28(8) and UK PRA SS2/21 as summarised by vendor templates,
checked 2026-10-25; those summaries are secondary, read the regulation text
before relying on them). We are not a regulated bank; we use the structure,
not the legal duty. "Exit tested" below says honestly whether we ever rehearsed it.

Where keys live: admin panel, Integrations page (stored encrypted in our database,
`SecretsService`), or Secrets Manager / environment variables. Registry:
`apps/api/src/common/secrets/provider-registry.ts`. Never paste a key into
chat, an issue or a commit; the repo is public.

Status pages: links from memory of the vendor sites, **verify before relying**.
LawBid itself has **no public status page yet** (see
[INCIDENT.md](INCIDENT.md) for the plan).

## Summary table

| Vendor | Used for | If down | If it bans us | Switch / setting | Exit tested |
|---|---|---|---|---|---|
| AWS | everything runs here | total outage | catastrophic | Terraform in `infra/` | restore drill only |
| Cloudflare | TURN, SFU, R2, DNS, Turnstile | calls degrade; photos fall back | calls, photos, DNS | `calls.video_provider`, `media.public_store` | no |
| Stripe | subscriptions, payouts, tax | no new payments | no money | `payments.*`, Stripe keys | no |
| Twilio | SMS login codes | no phone sign-up | same | `SMS_PROVIDER` | no |
| Bunny | video, reels | no video | same | Integrations `bunny_stream` | no |
| AWS SES | e-mail | no e-mails | same | `EMAIL_PROVIDER` | no |
| Firebase FCM | Android and web push | no push | same | Integrations `fcm` | no |
| Apple APNs | iOS push and VoIP | no iOS push, no ring | same | Integrations `apns` | no |
| Sentry | error tracking | blind, app fine | same | `SENTRY_DSN` | n/a |
| GitHub | code, CI, deploy | no deploys | catastrophic | two remotes | clone exists |
| Apple Developer | iOS app, push keys | no iOS updates | iOS gone | none | no |
| Google Play | Android app | no Android updates | Android gone | none | no |
| PagerDuty | phone paging | alarms by e-mail only | same | `pagerduty_https_endpoint` | n/a |
| Namecheap | domain registrar | none while DNS works | domain lost | nameservers | no |

## AWS

- **Use:** ECS Fargate (api, worker, admin), RDS PostgreSQL, ElastiCache Redis, S3 + KMS,
  CloudFront + WAF, ALB, SES, Rekognition, Macie, Secrets Manager, CloudWatch, SNS,
  Backup, ECR, Lambda (autoscale), OpenSearch (switch, off), Cloud Map.
- **Status:** <https://health.aws.amazon.com/health/status>
- **Down:** regional outage = whole product down. No second region serves traffic.
  Backups copy to a second-region vault, so data survives, service does not.
- **Ban / account closure:** everything lost except the second-region and off-account copies. Keep the repo, the Terraform state backup and the tfvars backup reachable from outside the account (owner task: confirm).
- **Fallback today:** Multi-AZ inside one region (RDS Multi-AZ pending in the Sunday window per handoff), restore from backup (drill 2026-10-25: RTO about 20 minutes, see [restore-drill.md](restore-drill.md)).
- **Exit:** Terraform (`infra/`) describes the stack, but modules are AWS-specific. Planned exit = containers (Docker images already portable) plus Postgres dump plus S3 sync to another cloud; estimate weeks, not tested. Stressed exit = restore latest backup into a new AWS account ([HANDOFF_NEW_ACCOUNT.md](HANDOFF_NEW_ACCOUNT.md)).
- **Code/settings:** `infra/envs/prod`, `.github/workflows/deploy.yml`, `rollback.yml`.

## Cloudflare

- **Use:** Realtime TURN and SFU (calls), R2 (public media, optional), DNS (move planned,
  see [DNS_TO_CLOUDFLARE.md](DNS_TO_CLOUDFLARE.md)), Turnstile (bot check), analytics API for usage.
- **Status:** <https://www.cloudflarestatus.com>
- **Down:** TURN down = calls fall back to STUN only (strict networks fail). SFU down = 2-4 person calls fall back to mesh, larger calls do not start with a clear message. R2/DNS down = photos or whole domain unreachable (DNS is the single biggest blast radius once moved; keep TTLs sensible).
- **Ban:** calls and public photos stop; DNS needs the registrar's nameservers changed back.
- **Fallback today:** `calls.video_provider = p2p` (mesh, default) works without Cloudflare SFU. `media.public_store = aws` serves photos from S3/CloudFront. Own coturn and LiveKit module exist in Terraform but are switched off (`turn_enabled=false`).
- **Exit:** set both switches back (seconds). Photos already in R2 stay readable via their stored bucket name, so first copy them to S3 (`apps/api/scripts/migrate-public-media-to-r2.ts` shows the pattern in reverse) before closing R2. DNS: re-create the records at Route 53 or the registrar (record list in the DNS runbook), then change nameservers.
- **Code/settings:** `apps/api/src/modules/calls/` (`cloudflare-turn.ts`, `cloudflare-sfu.*`, `video-call-provider.ts`), settings `calls.video_provider`, `calls.sfu_max_participants`, `calls.sfu_fallback_mesh_max`, `media.public_store`; Integrations `cloudflare_turn`, `cloudflare_sfu`, `cloudflare_r2`, `turnstile`. Runbook [TURN.md](TURN.md).

## Stripe

- **Use:** subscriptions ($399 per month for attorneys), one-time payments, stars top-ups, Tax, Connect payouts for payroll, treasury balance split.
- **Status:** <https://status.stripe.com>
- **Down:** checkout, renewals and webhooks stop; webhooks are queued by Stripe and retried (queue `stripe-webhooks`, DLQ alarm). A circuit breaker (`common/resilience/stripe-breaker.ts`) stops hammering. Access for existing subscribers continues on the grace window (`SUBSCRIPTION_PAST_DUE_GRACE_DAYS`).
- **Ban:** no incoming money and money held at Stripe is frozen. Highest business risk after AWS.
- **Fallback today:** the owner's own payment page (`payments.own_page_enabled`) is still Stripe-backed; the `FakePaymentProvider` exists for dev only. **No second processor is wired.**
- **Exit:** Stripe can export customers and cards to another processor on request (PCI data migration, takes weeks); we keep our own subscription and ledger tables, so entitlement state survives. Adding a second `PaymentProvider` (interface in `modules/billing/payment-provider.ts`) is the route; not built.
- **Code/settings:** `modules/billing/` (`stripe-payment.provider.ts`, `stripe-webhook.*`), `modules/treasury/`, env `STRIPE_*`, settings `billing.*`, `payments.*`. Runbooks [stripe-webhooks.md](stripe-webhooks.md), [payments-failed.md](payments-failed.md), [STRIPE_TAX.md](STRIPE_TAX.md), [treasury.md](treasury.md).

## Twilio

- **Use:** SMS one-time codes (login, sign-up, password reset).
- **Status:** <https://status.twilio.com>
- **Down / ban:** no phone sign-ups; e-mail, passkey and QR sign-in still work for existing users. A breaker exists in `twilio-sms.provider.ts`.
- **Fallback today:** `sms.login_code_enabled` lets us turn off SMS login codes; spend caps `sms.*`, `budget.*`; velocity limits per prefix and country.
- **Exit:** the provider interface is `SmsProviderName = 'mock' | 'twilio'` in `apps/api/src/config/provider-selection.ts`; a second provider (for example Amazon SNS or Vonage) is one new class plus one more name in that file and `env.schema.ts`. Not built. Number porting is not needed (we use a sender or messaging service).
- **Code/settings:** `SMS_PROVIDER` (`auto|mock|twilio`), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`; Integrations `twilio`. Runbook [sms-spend.md](sms-spend.md).

## Bunny (Stream)

- **Use:** video and reels upload (TUS), transcoding, signed playback, statistics.
- **Status:** <https://status.bunny.net>
- **Down / ban:** videos and reels do not play or upload; everything else works.
- **Fallback today:** none; the video feature can be hidden by feature flag. `DEV_FAKE_BUNNY` is dev only.
- **Exit:** export originals from the Bunny library (API), re-upload to another host (Cloudflare Stream, Mux, or S3 + MediaConvert). Playback URLs are signed by `modules/videos/bunny-signing.ts`; a new host means a new signer and client next to `bunny-stream.client.ts`.
- **Code/settings:** `modules/videos/`, env `BUNNY_*`, Integrations `bunny_stream`, settings `video.*`.

## AWS SES (e-mail)

- **Use:** transactional e-mail (codes, receipts, notifications), broadcasts.
- **Status:** AWS health page above.
- **Down:** no e-mails; SMS and push continue. Reputation limits: SES pauses sending above 10 percent bounces or 0.5 percent complaints; our alarms fire at 4 percent and 0.1 percent ([ses.md](ses.md)). A breaker exists in `ses-email.provider.ts`.
- **Ban:** same, appeals through AWS support.
- **Fallback today:** none wired.
- **Exit:** `EmailProviderName = 'mock' | 'ses'`; add a provider class (Postmark, Resend, SendGrid) the same way as SMS. DKIM/DMARC records are in the `ses` Terraform module and move with the domain.
- **Code/settings:** `EMAIL_PROVIDER`, `SES_REGION`, `SES_FROM_ADDRESS`; Integrations `ses`.

## Firebase Cloud Messaging (FCM)

- **Use:** Android push and web push.
- **Status:** <https://status.firebase.google.com>
- **Down / ban:** no pushes to Android; in-app realtime and badges still work while the app is open. SLO alarm `slo-push-*` fires.
- **Fallback today:** none for Android; the worker retries via the `push` queue.
- **Exit:** no real alternative on Android (FCM is the platform channel). Mitigation is the in-app inbox and e-mail. Keep the Firebase project owned by the company account, not a person.
- **Code/settings:** `modules/notifications/push/fcm-push.sender.ts`, env `FCM_*`, Integrations `fcm`.

## Apple Push (APNs) and VoIP

- **Use:** iOS push and CallKit VoIP pushes (incoming calls ring).
- **Status:** Apple System Status (developer section), <https://developer.apple.com/system-status/>
- **Down / ban:** iOS gets no pushes and calls do not ring when the app is closed.
- **Fallback today:** none; the app still shows state when opened.
- **Exit:** none possible on iOS. Keep the APNs key (.p8) in the secrets store and a recovery path to the Apple account (planned account transfer to the company entity).
- **Code/settings:** `push/apns-voip.sender.ts`, env `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, Integrations `apns`. Runbook [IOS_CHAT_NOTIFICATIONS.md](IOS_CHAT_NOTIFICATIONS.md).

## Sentry

- **Use:** error and crash tracking (API, worker, admin, apps).
- **Status:** <https://status.sentry.io>
- **Down / ban:** we are blind to exceptions; the product keeps running. CloudWatch logs and alarms remain.
- **Fallback today:** CloudWatch log metric filters.
- **Exit:** unset `SENTRY_DSN` (Sentry starts only when a DSN is set); replace with another OTLP/Sentry-compatible backend. OpenTelemetry exporters are already in `apps/api`.
- **Code/settings:** `SENTRY_DSN`, `apps/api/src/telemetry/sentry.ts`, Integrations `sentry`.

## GitHub

- **Use:** source, CI (`api-ci`, `admin-ci`, `mobile-ci`, CodeQL, secret scan), deploy via OIDC to AWS, drift check, load test, mobile release.
- **Status:** <https://www.githubstatus.com>
- **Down:** no merges, no deploys. Production keeps running. Emergency deploy path: [DEPLOY_PROD.md](DEPLOY_PROD.md) (from a Mac with AWS credentials).
- **Ban:** lose the repo and pipelines. There are two remotes and local clones; images in ECR still run.
- **Exit:** any git host; workflows are GitHub-specific and must be rewritten. Keep a periodic mirror (owner task: confirm one exists).
- **Settings:** repository variables `DEPLOY_ENABLED`, `STAGING_ENABLED`, `SIGN_REQUIRED`; environment `production` with required reviewers.

## Apple Developer Program and Google Play

- **Use:** distribution of the iOS and Android apps, signing identities, push keys (Apple), store listings.
- **Status:** Apple <https://developer.apple.com/system-status/>; Google Play <https://status.play.google.com> (verify).
- **Down:** cannot ship updates; installed apps keep working, and server-side feature switches still work.
- **Ban:** the app disappears from that store. Android users can sideload an APK; iOS has no such path in the US. The web app (Flutter web on CloudFront) is the fallback surface.
- **Exit:** none. Mitigations: follow store policies, keep both accounts under the company entity, keep signing keys backed up outside one laptop, keep the web app alive.
- **Code:** `apps/mobile`, `.github/workflows/mobile-release.yml`, [STORE_RELEASE.md](STORE_RELEASE.md).

## PagerDuty (Free plan)

- **Use:** phone and SMS paging for the 6 composite SLO alarms (OTP, calls, pushes; fast and slow burn). Free plan limits (5 users, 100 phone/SMS per month) were read on 2026-10-24.
- **Status:** <https://status.pagerduty.com>
- **Down / ban:** alarms still go by e-mail (and Slack) from the same SNS topics; only the phone call is lost. The in-app on-call also pushes admins.
- **Exit:** set `pagerduty_https_endpoint = null` and apply; replace with another SNS HTTPS target (Better Stack, Opsgenie-class). Grafana OnCall OSS is archived (2026-03-24), AWS Incident Manager is closed to new customers.
- **Settings:** Terraform variable `pagerduty_https_endpoint` (secret, kept only in Secrets Manager). Runbook [paging.md](paging.md).

## Smaller vendors (one function each)

| Vendor | Function | If gone | Switch |
|---|---|---|---|
| Namecheap | domain registrar (DNS moves to Cloudflare) | cannot renew or repoint domain | keep auto-renew and 2FA on; transfer-out is standard |
| Persona | ID verification (`persona` integration) | verification falls to manual review in admin | Integrations `persona` |
| Google Translate | paid translation (`google_translate`) | machine translation off | Integrations |
| Google / Apple sign-in | social login | e-mail, phone and passkey remain | Integrations `google_signin`, `apple_signin` |
| AWS Rekognition, PhotoDNA, NCMEC | media moderation, child-safety reporting (legal duty) | media moderation queue stalls; escalate immediately | Integrations `aws_rekognition`, `photodna`, `ncmec` |
| ClamAV (self-hosted, mirrored by `mirror-clamav.yml`) | upload virus scan | uploads wait in `files` queue | `virus-scanner.ts` |

## Review rhythm

Once a quarter (with the restore drill): re-check status links, free-plan limits, whether a
fallback in this file became real, and rehearse one exit step. Record the result in
[restore-drill.md](restore-drill.md) or a dated note. Dates in this file: written 2026-10-25.
