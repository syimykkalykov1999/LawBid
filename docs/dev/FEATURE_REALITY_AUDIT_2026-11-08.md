# Feature reality audit (2026-11-08)

Owner's order: «много функции и настроек даже после вкл не работают… проверь на все такие вещи».
Question for every admin setting, flag, integration card and switch: is the value really read on the
code path users hit, is the prerequisite there on prod, and is there proof from prod.

How it was checked:
- 668 setting keys from `apps/api/src/common/app-settings/app-settings.defaults.ts`. Each key was
  matched against every quoted literal in `apps/api/src`, `apps/mobile/lib` and `apps/admin/src`,
  then traced by hand for the user-facing domains.
- 51 flags from `apps/api/src/modules/feature-flags/flag-catalog.ts`, plus the live values from
  `GET https://api.lawbid.dev/api/v1/config/bootstrap`.
- Env and secret names from the live ECS task definitions (`lawbid-prod-api:133`, `lawbid-prod-worker:131`,
  image `86d1cee1f`).
- Warning and error logs from the last 24 h of `/lawbid/lawbid-prod/api` and `/lawbid/lawbid-prod/worker`,
  plus 7 days of the economy-guard and «permission denied» lines.
- AWS Cost Explorer: November spend so far and the forecast.

Statuses: **WORKS**, **DEAD** (stored but never read), **BROKEN** (read but cannot work),
**MISSING PREREQUISITE**, **OVERRIDDEN** (read, but another switch wins).

## 1. Root cause of most of «включил, а не работает»: the economy guard is stuck ON

Proof from prod (worker log, `EconomyService`):

| when (UTC) | state | spend forecast | allowed |
|---|---|---|---|
| 11-06 23:10 | on | $361 | $350 |
| 11-07 00:00 | off | | |
| 11-07 22:10 | on | $355 | $350 |
| 11-08 00:00 | off | | |
| 11-08 06:10 | on, still on now | $441 | $350 |

The guard counts the whole AWS bill. Cost Explorer gives about $78 for 1–8 November and a forecast of
about $402 for the rest of the month. The floor `economy.min_threshold_usd` is $350, and the guard
releases only below 90 % of it. The guard therefore cannot switch itself off. Pausing videos and SMS
does not lower the AWS bill.

What users feel while it is on (`economy.service.ts:540`, `ops-state.service.ts:170`):
- **every new video upload, reel and video post is refused** with 503 «Video uploads are paused» (10 refusals in
  the API log in 24 h; `videos.service.ts:142`). The flags `video_posts`, `reels_client_publish` still say ON;
- **phone codes work only for sign-in, password reset, re-auth and linking** (`otp.service.ts:226`);
- **caps of paid providers drop to their floor**: sms, email, id_check, storage uploads, translate, video,
  image_moderation (`cost-guard.constants.ts:27`). Their hourly auto-raise is frozen. When the
  image-moderation cap runs out, the check is skipped (`media-moderation.service.ts:443`);
- **API and worker are held at the minimum number of containers** (`economy.service.ts:617`).

Status: **BROKEN by rule** (needs owner decision, see §5.1). Quick relief the owner can apply himself:
Admin → Экономика: raise «Минимальный порог» (`economy.min_threshold_usd`) above about $500, or switch
the `economy_guard` flag off.

## 2. Table: user-facing items

Paths are under `apps/api/src` unless they start with `apps/`. «PR» means fixed in this audit's PR.

| item | should change | reader (file:line) | read on the real path? | prerequisite on prod | proof on prod | status |
|---|---|---|---|---|---|---|
| economy guard (`economy_guard`, `economy.*`) | brake on third-party spend | `common/economy/economy.service.ts:407` | yes, every 5 min | AWS Budgets / Cost Explorer readable | log `economy_guard_on` 06:10, AWS forecast $402 | BROKEN by rule (§5.1) |
| flag `recommendations_qa_ranking`, `reco.qa.*`, `reco.*.qa*` | Q&A boost in people/case ranking, «рекомендуемые вопросы» | `modules/recommendations/qa-snapshot.service.ts:97,222` | yes, nightly job | DB right TRUNCATE (absent) | worker: «permission denied for table reco_qa_snapshots», 12 times in 7 days | BROKEN → **PR**: DELETE instead of TRUNCATE |
| flag `demo_code_login` (App Store / Google Play reviewer demo) | demo world behind the code | `modules/demo/demo-database.service.ts:275` | yes, at boot | DEMO_DATABASE_URL present | API: «Demo world is not available … type "deal_record_status" already exists» on every boot | BROKEN → **PR**: half-applied migration is replayed past «already exists» |
| `security.attorney_strong_auth` (on) with flag `passkey_login` (off) | attorney with a passkey must use it | `modules/auth/password-auth.service.ts:201` | yes | passkey sign-in on | prod: `passkey_login=false` | BROKEN (lock-out: password refused, passkey disabled) → **PR**: rule applies only while passkeys are on |
| `rate_limit.message_per_minute` | messages per minute | `common/usage-limits/usage-limits.service.ts:61` ← `modules/chat/chat.service.ts:1089` | direct chats only; group send never counted | — | code | BROKEN (half) → **PR**: group messages counted too |
| `stories.max_video_sec`, `channels.max_post_media` | limits shown by the app | `apps/mobile/lib/features/stories/application/stories_providers.dart:42`, `apps/mobile/lib/features/channels/application/channel_compose.dart:31` | app reads them, bootstrap never sent them | — | keys absent from prod bootstrap | BROKEN (app side) → **PR**: added to `PUBLIC_CONFIG_PREFIXES` |
| push (FCM) | pushes | `modules/notifications/push/fcm-push.sender.ts:398` | yes | FCM card | 30 × «fcm send failed 400 INVALID_ARGUMENT» for one user in 24 h, reason not logged | BROKEN for that device, cause unknown → **PR**: FCM's own error text is logged |
| flag `auto_bar_check` | old licence auto-check | none (`modules/verification/providers/verification-provider.selector.ts:22`) | no | — | prod shows it **ON** in Admin → Флаги | DEAD → **PR**: marked `retired`, leaves the DB at boot |
| flag `chat_translate` + `translate.scope` / `translate.<zone>` | translation | `modules/translation/translation.service.ts:74`, `translation-zones.ts:31`, `apps/mobile/lib/features/translation/presentation/translate_block.dart:129` | yes | Google Translate key (not verified) | prod: flag **off**, all `translate.*` **on** | WORKS (off). Admin Config shows the zones as ON while the flag keeps everything off (§5.4) |
| `push.chat_preview`, `queues.push_rate_*`, `notifications.retention_days` | push text, send rate, cleanup | `modules/notifications/push/push-dispatcher.ts:349,166`, `jobs/handlers/notifications-retention.job.ts:22` | yes | FCM | — | WORKS |
| chat `chat.edit_window_min`, `delete_for_all_hours`, `max_pins`, `link_preview_*`, `groups.max_members`, `stickers.*`, `rate_limit.forward/chat_save` | chat limits | `modules/chat-actions/chat-actions.service.ts:151,267,414`, `modules/link-preview/link-preview.service.ts:122`, `modules/groups/groups.service.ts:190`, `modules/stickers/stickers.service.ts` | yes | — | — | WORKS |
| `channels.*` | channels | `modules/channels/channels.service.ts` | yes | — | flag `channels` **off** on prod | WORKS (feature hidden) |
| `stories.*` | stories | `modules/stories/stories.service.ts:310` | behind flag `stories` | — | flag `stories` **off** | WORKS (feature hidden) |
| uploads `files.*`, `uploads.limits`, `media.*` | upload limits | bootstrap + files service | yes | R2 / S3 | bootstrap sends them | WORKS (media path is another helper's area) |
| video `video.*`, `reels_client_publish*`, `video_posts` | video uploads | `modules/videos/videos.service.ts:142-531` | yes | Bunny card | 503 «paused» × 10 | OVERRIDDEN by the economy guard (§1) |
| `video.max_duration_sec` | old reel limit | `modules/videos/videos.service.ts:513` | only while `video.reel_max_duration_sec` is not stored | — | — | partly DEAD (still on the admin page) |
| moderation text `moderation.blocked_terms/hold_terms/max_links/duplicate_*` | text block/hold | `modules/moderation/rule-based-moderation.hook.ts:68` | posts, comments, case comments | — | — | WORKS (Q&A, reviews, channel posts are not covered) |
| `moderation.detect.*` | AI text classifier | `modules/moderation/text-detector.service.ts:132` | yes | `openai_moderation` key (not verified) | default `off` | WORKS / MISSING PREREQUISITE if no key (silently allows) |
| `moderation.auto_hide_*`, `weight.*`, `report_abuse.*`, `strikes.*`, `auto.*`, hold queue, restore rules | report handling | `modules/moderation/*.service.ts` | yes | — | — | WORKS |
| `moderation.image.*` | photo check (Rekognition) | `modules/media-moderation/media-moderation.service.ts:372` | yes | `aws_rekognition` card (not verified) | — | WORKS; skipped when the cap is spent (guard) |
| `moderation.video.frames_*` | frame-by-frame video check | `modules/media-moderation/media-moderation.service.ts:206` | yes | ffmpeg in the image (`WITH_FFMPEG`, default 0) | not verified | MISSING PREREQUISITE (likely) |
| `moderation.csam.ncmec_submit_enabled` (default on) | report to NCMEC | `modules/media-moderation/csam.adapters.ts:116` | stub: no secret = manual, with a secret it throws | `ncmec` | — | BROKEN (stub, §5.5) |
| `qa.*` safety | Q&A checks | `modules/legal-qa/qa-safety.service.ts` | yes | — | — | WORKS |
| `search.weight_*`, `ranked_cache_ttl_sec`, `learn_min_users`, `rate_limit.search_*` | search ranking/limits | `modules/search/postgres-search.provider.ts:258`, `search.service.ts:875` | yes | — | — | WORKS |
| `search.engine`, `engine_kind`, `engine_timeout_ms`, `reindex_*` | OpenSearch | `modules/search/search-switch.provider.ts:98` | only when an engine is set | OPENSEARCH_URL **empty** on prod | admin refuses `engine` without the URL | MISSING PREREQUISITE (Postgres search works) |
| `feed.*`, `reco.case/people/post.*` | feed and reco weights | `modules/feed/feed.service.ts:519`, `modules/recommendations/recommendations.service.ts:180` | yes | — | — | WORKS |
| `ranking.events_mode`, `ranking.impression_sample_percent` | ranking event log | `modules/experiments/ranking-events.service.ts:97` | `logImpression`/`logAction` have no caller | — | — | DEAD (§5.6) |
| `experiments.*` | A/B tests | `modules/experiments/*` | `ExperimentsService.variant` has no caller | — | — | DEAD for users (§5.6) |
| `sms.*` registration/reset caps, anti-pumping, `security.otp_per_identifier_per_day` | SMS limits | `modules/auth/auth.service.ts:1541,1564,1584`, `modules/auth/password-auth.service.ts:308`, `common/cost-guard/sms-abuse-guard.service.ts:156` | yes | Twilio (SMS_PROVIDER=twilio) | — | WORKS |
| owner rule «SMS только регистрация и «Забыл пароль»» | — | `modules/users/services/contacts.service.ts:115` | phone change in Settings sends an SMS (purpose `contact`) | — | — | BROKEN vs rule (§5.2) |
| `compliance.sms.disclosure_*` | consent text | `modules/compliance/sms-compliance.service.ts:63` | the app shows a fixed string (`apps/mobile/lib/features/auth/presentation/screens/phone_screen.dart:238`) | — | — | DEAD |
| `compliance.sms.marketing_enabled`, quiet hours | non-code SMS | `modules/compliance/sms-compliance.service.ts:278` | no caller | — | — | DEAD (harmless: no such SMS exists) |
| `security.app_check.mode` | App Check | `modules/auth/app-check/app-check.guard.ts:267` | yes | app must send a token | prod: monitor; every verdict `missing` | WORKS as monitor; do **not** switch to enforce (§5.3) |
| `security.turnstile.mode` | web bot check | `modules/auth/app-check/app-check.guard.ts:254` | yes | Turnstile card | no site key in bootstrap | MISSING PREREQUISITE (off) |
| `security.password_*`, `seal_*`, `new_country_alert_enabled`, `guest.*`, `realtime.max_*`, every other `rate_limit.*`, `admin.ip_allowlist*`, `admin.max_concurrent_sessions` | security | see sub-agent trace in this file's history | yes | — | — | WORKS |
| `security.signup_block_disposable_email` | block throw-away e-mail | `modules/auth/auth.service.ts:372` | e-mail path only | `email_login` (off) | — | effectively off |
| `admin.login_alert_enabled`, ops alert e-mails | e-mail the owner | `modules/admin-auth/admin-security.service.ts:164`, push dispatcher | yes | SES identity of the owner address | worker: «ops alert email skipped: Email address is not verified » (owner address) | MISSING PREREQUISITE (§6) |
| `admin.audit_export_enabled` (on) | daily audit copy | `modules/admin/audit-export.service.ts:95` | yes | `ADMIN_AUDIT_EXPORT_BUCKET` **empty** | — | MISSING PREREQUISITE (no-op) |
| contacts sync pepper | phone-book hashes | `ContactsPepper` | yes | `CONTACTS_PEPPER` **not set** | warn on every boot | MISSING PREREQUISITE (§6) |
| payments: `payments_in_app` (locked), `stars`, `bid_packs`, `dispute_auto_refund`, `payroll_stripe_payouts` | money | `modules/case-payments/case-payments.service.ts:255…`, `common/feature-flags/locked-flags.ts:8` | yes | — | all off on prod | WORKS (off) |
| `billing.*`, `stripe_ops.*`, `treasury.*` | Stripe upkeep | webhook / job paths | only on Stripe events | Stripe card (not verified) | — | no-op until Stripe is live |
| `deal_record.enabled`, `bids.rich_terms_enabled`, `bids.confirmation_required` | deal paperwork | `modules/bids/acceptance/bid-acceptance.service.ts:88`, `modules/bids/bids.service.ts:630` | yes | — | on in bootstrap | WORKS |
| login flags `phone/password/email/apple/google/passkey_login`, `web_client`, `role_switch` | sign-in methods | `modules/auth/services/login-method-policy.service.ts:39` + app `welcome_screen.dart` | yes, API and app | — | bootstrap | WORKS (the app has no Apple/Google buttons at all) |
| integration card `persona` | ID checks | none (`modules/verification/providers/verification-provider.selector.ts` is always manual) | no | — | — | DEAD card |
| integration cards twilio, ses, fcm, stripe, turnstile, google_translate, opensearch, state registries, aws_*, google_places, openai_moderation, anthropic, calendars | — | `common/secrets/secrets.service.ts:243` resolve | yes; the card's «Ключ включён» switch is honoured (`:250`) | the card | not verified per card | WORKS |
| GroupFanoutQueue at boot | group delivery concurrency | `modules/groups/group-fanout.queue.ts` | yes | Redis | API: «group fan-out concurrency not set: Command timed out» × 8 at one boot | transient Redis timeout at start (watch) |
| OpsGuard | pauses heavy jobs when the DB is slow | `OpsGuardJob` | yes | — | «heavy background jobs paused: database is slow» (985 ms) | WORKS (by design, watch) |

Other domains (calls, media/R2 signed URLs, admin back-end speed, infra automation, second-admin
approvals, client caching) belong to other helpers and are left out here.

Literal scan result: every one of the 668 setting keys has a reader except the 11 `seo.checklist.*`
keys. Those are the owner's manual check-list marks, stored by design. The keys that are only
literal in the admin page (`reco.*`, `cases.stale_*`, `cache.limit_mb.*`, `translate.*`) are read
through built-up names (`recommendations.service.ts:180`, `domain/case-staleness.ts:74`,
`apps/mobile/lib/core/cache/cache_limits.dart:85`, `translation-zones.ts:23`).

## 3. Batch 1 PR (code-side fixes, each with a test)

1. `qa-snapshot.service.ts`: `DELETE FROM` instead of `TRUNCATE` (the prod role has no TRUNCATE right).
2. `demo-database.service.ts`: a migration left half-applied is replayed with the «already exists»
   SQLSTATEs skipped, and only for that migration. Its old row is marked `rolled_back_at`.
3. `bootstrap.service.ts`: sends `stories.max_video_sec` and `channels.max_post_media` to the app.
4. `password-auth.service.ts`: `security.attorney_strong_auth` applies only while `passkey_login` is on.
5. `groups.service.ts`: group messages count against `rate_limit.message_per_minute`.
6. `fcm-push.sender.ts`: logs FCM's error text, so the INVALID_ARGUMENT cause shows up.
7. `flag-catalog.ts`: `auto_bar_check` is marked `retired`, so it leaves the admin flags list.

## 4. After the deploy: proof to collect

- Worker log the next night: `Q&A snapshot: … attorneys` instead of «permission denied».
- API log after the deploy: «Demo world ready» (or «replaying a half-applied migration», then ready).
- Bootstrap shows `stories.max_video_sec` and `channels.max_post_media` once an admin saves them.
- The next «fcm send failed» line has a `detail` field.
- Admin → Флаги no longer lists «Автопроверка лицензии (старый переключатель)».

## 5. Needs owner decision (each would change behaviour beyond wiring)

1. **What the economy guard counts.** Recommended: the guard trips on third-party metered spend only
   (SMS, Bunny video, translation, ID checks, Cloudflare). This matches the guard's own text
   «расходы на сторонние сервисы» and the defaults' comment «third-party spend». The AWS bill would
   stay on the report and keep capping the container ceiling.

   How others handle this:
   - AWS Budgets actions and GCP budget alerts tie a brake to the budget it controls.
   - Twilio, Bunny and Cloudflare caps are per service.
   - Nobody pauses user features because the infrastructure bill is fixed.

   Alternative: keep the rule and raise `economy.min_threshold_usd` to about $500 or more.
2. **Phone change sends an SMS** (Settings → Account → phone), against the rule «SMS только в двух
   случаях». Recommended: confirm the new phone with the password or passkey and no SMS (how
   Telegram, WhatsApp and Signal change a number), or switch it off for now. This is a product
   change, so it was not done.
3. **App Check stays in monitor.** Every prod verdict is `missing`, so the app sends no App Check
   token. Check the Firebase App Check registration of the release builds before ever choosing
   enforce, or phone sign-up and reset would be refused.
4. **Translation on/off is in two places.** The admin Config page shows `translate.*` as ON while the
   `chat_translate` flag keeps everything off. Recommended: one switch on the Google Translate card
   and a note next to the zones (an admin text change, so it needs your yes: UI is frozen).
5. **NCMEC switch defaults to ON but is a stub.** Recommended: default it to off and label it «не
   подключено» until a real CyberTipline adapter exists.
6. **Ranking events and experiments have no producer.** Their admin screens change nothing.
   Recommended: hide them until they are wired (wiring them is new functionality).
7. **Persona card** (ID checks are manual by your decision). Recommended: remove the card.

## 6. Missing prerequisites: exact steps (owner part)

1. **SES:** verify the owner e-mail address that ops alerts go to (AWS console → SES us-east-1 → Identities → Create
   identity → e-mail → click the link in the letter), or request SES production access. Until then
   admin login alerts and ops incident letters are not sent.
2. **CONTACTS_PEPPER:** create the secret `lawbid-prod/CONTACTS_PEPPER` (random 32+ bytes) and add it
   to the API and worker task definitions (Terraform). Follow `docs/runbooks/DEPLOY_PROD.md`, and note
   that existing contact hashes are re-made on the next sync.
3. **ADMIN_AUDIT_EXPORT_BUCKET** is empty, so the daily audit-log copy (on) does nothing. Create the
   locked bucket in Terraform and set the env var, or switch `admin.audit_export_enabled` off.
4. **OpenSearch:** OPENSEARCH_URL is empty. Search runs on Postgres, which is fine; nothing to do
   unless the engine is wanted.
5. **ffmpeg for frame-by-frame video moderation:** set the repository variable `WITH_FFMPEG=1` (or
   switch `moderation.video.frames_enabled` off so the admin does not claim it).
6. **Integration keys not verified from outside:** Google Translate, OpenAI moderation, Rekognition,
   Turnstile. Admin → Ключи и сервисы shows whether each card is filled.
