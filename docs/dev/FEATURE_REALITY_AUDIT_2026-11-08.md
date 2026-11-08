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

Statuses:
- **WORKS**: read on the real path.
- **FIXED**: was BROKEN or DEAD; a PR wires it.
- **DEAD**: stored but never read.
- **BROKEN**: read, but it cannot work.
- **NOT CONFIGURED** (= missing prerequisite).
- **OVERRIDDEN**: read, but another switch wins.
- **inert**: read only behind another switch that is off.

This file is the umbrella audit. These areas were audited in depth by other helpers and are only
referenced here:
- calls: PR #838;
- client caching: PR #839;
- admin speed: PR #840;
- media, R2 and upload speed: PR #841 and a follow-up;
- every «Авто» and automatic mode (scaling, DB/Redis size, HA, partitioning, economy, infra
  pipeline, last_good_tag): PR #843 and `docs/dev/AUTOMATION_AUDIT_2026-11-08.md`.

The appendix (§7) lists **every** setting key (668), flag (51) and integration card (34) with its
reader and status.

## 1. Root cause of most of «включил, а не работает» today: the economy guard was stuck ON

Proof from prod (worker log, `EconomyService`):

| when (UTC) | state | spend forecast | allowed |
|---|---|---|---|
| 11-06 23:10 | on | $361 | $350 |
| 11-07 00:00 | off | | |
| 11-07 22:10 | on | $355 | $350 |
| 11-08 00:00 | off | | |
| 11-08 06:10 | on | $441 | $350 |
| 11-08 19:52 | off: an admin changed «Экономика» settings (`PATCH /api/v1/admin/economy/settings`) | | |

The guard counts the whole AWS bill. Cost Explorer gives about $78 for 1–8 November and a forecast of
about $402 for the rest of the month. The floor `economy.min_threshold_usd` is $350, and the guard
releases only below 90 % of it. With the old floor the guard could not switch itself off; the
releases at 00:00 happened only because Cost Explorer's forecast dips right after midnight. It
stayed on from 06:10 to 19:52 UTC until an admin changed the economy settings. No re-entry since
then (worker log checked at 22:30 UTC). Pausing videos and SMS does not lower the AWS bill, so the
same thing returns whenever the AWS forecast passes the floor again.

What users feel while it is on (`economy.service.ts:540`, `ops-state.service.ts:170`):
- **every new video upload, reel and video post is refused** with 503 «Video uploads are paused» (10 refusals in
  the API log in 24 h; `videos.service.ts:142`). The flags `video_posts`, `reels_client_publish` still say ON;
- **phone codes work only for sign-in, password reset, re-auth and linking** (`otp.service.ts:226`);
- **caps of paid providers drop to their floor**: sms, email, id_check, storage uploads, translate, video,
  image_moderation (`cost-guard.constants.ts:27`). Their hourly auto-raise is frozen. When the
  image-moderation cap runs out, the check is skipped (`media-moderation.service.ts:443`);
- **API and worker are held at the minimum number of containers** (`economy.service.ts:617`).

Status: **BROKEN by rule**, released by hand for now (needs owner decision, see §5.1). PR #843 rates
the guard's two-way switching as WORKS; the open problem is the rule, not the mechanism. If it trips
again: Admin → Экономика, raise «Минимальный порог» (`economy.min_threshold_usd`) above the AWS
forecast divided by 0.9.

## 2. Table: user-facing items

Paths are under `apps/api/src` unless they start with `apps/`. «PR» means fixed in this audit's PR.

| item | should change | reader (file:line) | read on the real path? | prerequisite on prod | proof on prod | status |
|---|---|---|---|---|---|---|
| economy guard (`economy_guard`, `economy.*`) | brake on third-party spend | `common/economy/economy.service.ts:407` | yes, every 5 min | AWS Budgets / Cost Explorer readable | log `economy_guard_on` 06:10, released 19:52 by an admin settings change; AWS forecast $402 | BROKEN by rule (§5.1) |
| flag `recommendations_qa_ranking`, `reco.qa.*`, `reco.*.qa*` | Q&A boost in people/case ranking, «рекомендуемые вопросы» | `modules/recommendations/qa-snapshot.service.ts:97,222` | yes, nightly job | DB right TRUNCATE (absent) | worker: «permission denied for table reco_qa_snapshots», 12 times in 7 days | BROKEN → FIXED in #843 (the same one-line fix; #844 carries the identical file so the two merge cleanly) |
| flag `demo_code_login` (App Store / Google Play reviewer demo) | demo world behind the code | `modules/demo/demo-database.service.ts:275` | yes, at boot | DEMO_DATABASE_URL present | API: «Demo world is not available … type "deal_record_status" already exists» on every boot | BROKEN → **PR**: half-applied migration is replayed past «already exists» |
| `security.attorney_strong_auth` (on) with flag `passkey_login` (off) | attorney with a passkey must use it | `modules/auth/password-auth.service.ts:201` | yes | passkey sign-in on | prod: `passkey_login=false` | BROKEN (lock-out: password refused, passkey disabled) → **PR**: rule applies only while passkeys are on |
| `rate_limit.message_per_minute` | messages per minute | `common/usage-limits/usage-limits.service.ts:61` ← `modules/chat/chat.service.ts:1089` | direct chats only; group send never counted | — | code | BROKEN (half) → **PR**: group messages counted too |
| `stories.max_video_sec`, `channels.max_post_media` | limits shown by the app | `apps/mobile/lib/features/stories/application/stories_providers.dart:42`, `apps/mobile/lib/features/channels/application/channel_compose.dart:31` | app reads them, bootstrap never sent them | — | keys absent from prod bootstrap | BROKEN (app side) → **PR**: added to `PUBLIC_CONFIG_PREFIXES` |
| push (FCM) | pushes | `modules/notifications/push/fcm-push.sender.ts:398` | yes | FCM card | 30 × «fcm send failed 400 INVALID_ARGUMENT» for one user in 24 h, reason not logged | BROKEN for that device, cause unknown → **PR**: FCM's own error text is logged |
| flag `auto_bar_check` | master of automatic bar-licence lookups | `modules/verification/providers/bar-lookup/auto-bar-lookup.provider.ts` (`masterOn`) | was not read since 2026-10-05 | per-state registry enabled | prod shows it **ON** | DEAD → FIXED (#844): read again as the master; off = no registry call, manual review |
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

1. `qa-snapshot.service.ts`: the fix belongs to #843; #844 carries the byte-identical file, so whichever lands first, the other merges clean.
2. `demo-database.service.ts`: a migration left half-applied is replayed with the «already exists»
   SQLSTATEs skipped, and only for that migration. Its old row is marked `rolled_back_at`.
3. `bootstrap.service.ts`: sends `stories.max_video_sec` and `channels.max_post_media` to the app.
4. `password-auth.service.ts`: `security.attorney_strong_auth` applies only while `passkey_login` is on.
5. `groups.service.ts`: group messages count against `rate_limit.message_per_minute`.
6. `fcm-push.sender.ts`: logs FCM's error text, so the INVALID_ARGUMENT cause shows up.
7. `auto-bar-lookup.provider.ts`: the `auto_bar_check` flag is the master of automatic bar lookups again (off = no registry call, every licence to a verifier); catalog default on; admin text says what it does.

## 4. After the deploy: proof to collect

- Worker log the next night: `Q&A snapshot: … attorneys` instead of «permission denied».
- API log after the deploy: «Demo world ready» (or «replaying a half-applied migration», then ready).
- Bootstrap shows `stories.max_video_sec` and `channels.max_post_media` once an admin saves them.
- The next «fcm send failed» line has a `detail` field.
- Admin → Флаги shows «Автопроверка лицензии адвоката» with the new text; switching it off sends new licences to manual review.

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

## 7. Appendix: every setting, flag and integration card

### B. Every feature flag (51)

| flag | prod | reader | status |
|---|---|---|---|
| `economy_guard` | on | `common/economy/economy.service.ts:218` | WORKS; rule counts the AWS bill (§1, §5.1) |
| `crash_reports` | on | `modules/crash-reports/crash-reports.service.ts:65`, `apps/mobile/lib/core/feature_flags/feature_flags_providers.dart:136` | WORKS (own crash endpoint; Sentry DSN not configured) |
| `app_events` | on | `modules/analytics/app-events.service.ts:26`, `apps/mobile/lib/core/feature_flags/feature_flags_providers.dart:135` | WORKS |
| `hide_counts` | on | `apps/mobile/lib/features/social/application/social_providers.dart:1274` | WORKS |
| `stars` | off | `apps/mobile/lib/features/stars/application/stars_providers.dart:14` | WORKS |
| `bid_packs` | off | `apps/mobile/lib/features/plans/presentation/plan_offer.dart:59` | WORKS |
| `firm_profiles` | off | `apps/mobile/lib/features/profile/presentation/screens/settings_screen.dart:227` | WORKS |
| `video_calls` | on | `modules/calls/calls.service.ts:384`, `apps/mobile/lib/features/calls/application/call_controller.dart:2934` | see #838 calls |
| `calls_group` | off | `modules/calls/calls.service.ts:1843`, `apps/mobile/lib/features/calls/application/call_controller.dart:2941` | see #838 calls |
| `stories` | off | `modules/stories/stories.service.ts:95`, `apps/mobile/lib/features/stories/application/stories_providers.dart:33` | WORKS |
| `channels` | off | `modules/channels/channels.service.ts:136`, `apps/mobile/lib/features/channels/application/channels_providers.dart:29` | WORKS |
| `consultations` | on | `modules/consultations/consultations.service.ts:1076`, `apps/mobile/lib/features/consultations/application/consultations_providers.dart:18` | WORKS |
| `legal_qa` | on | `modules/legal-qa/legal-qa.service.ts:554`, `apps/mobile/lib/features/legal_qa/application/legal_qa_providers.dart:18` | WORKS |
| `recommendations_qa_ranking` | on | `modules/recommendations/qa-snapshot.service.ts:100` | BROKEN → FIXED (#843 snapshot) |
| `deadline_calculator` | off | `modules/deadlines/deadlines.service.ts:450`, `apps/mobile/lib/features/team/presentation/tasks_tab.dart:718` | WORKS |
| `document_templates` | on | `modules/document-templates/document-templates.service.ts:318`, `apps/mobile/lib/features/templates/application/templates_providers.dart:10` | WORKS |
| `web_client` | on | `modules/auth/services/login-method-policy.service.ts:62` | WORKS |
| `video_posts` | on | `modules/videos/videos.service.ts:114`, `apps/mobile/lib/core/feature_flags/feature_flags_api_client.dart:77` | WORKS; was OVERRIDDEN by the economy guard 06:10–19:52 UTC |
| `reels_client_publish` | on | `modules/posts/posts.service.ts:174`, `apps/mobile/lib/features/reels/application/reels_providers.dart:51` | WORKS; was OVERRIDDEN by the economy guard |
| `reels_client_publish_paid_only` | on | `modules/posts/posts.service.ts:185`, `apps/mobile/lib/features/reels/application/reels_providers.dart:52` | WORKS; was OVERRIDDEN by the economy guard |
| `files_multipart` | on | `modules/files/files.service.ts:372`, `apps/mobile/lib/core/uploads/upload_queue.dart:525` | WORKS |
| `channel_views_buffered` | off | `modules/channels/channels.service.ts:966` | WORKS |
| `video_prefetch_smart` | on | `apps/mobile/lib/core/media/prefetch_policy.dart:25` | WORKS |
| `web_post_window` | on | `apps/mobile/lib/features/social/presentation/widgets/post_window.dart:28` | WORKS |
| `low_power_mode` | off | `apps/mobile/lib/core/feature_flags/feature_flags_providers.dart:126` | WORKS |
| `chat_files_from_disk` | on | `apps/mobile/lib/features/chat/presentation/conversation_screen.dart:282` | WORKS |
| `group_files_from_disk` | off | `apps/mobile/lib/features/groups/presentation/group_conversation_screen.dart:300` | WORKS |
| `web_file_drop` | on | `apps/mobile/lib/shared/presentation/file_drop_zone.dart:48` | WORKS |
| `files_reuse_own` | on | `modules/files/files.service.ts:316` | WORKS |
| `files_confirm_light` | on | `modules/files/files.service.ts:555` | WORKS |
| `reels_tus_parallel` | on | `apps/mobile/lib/features/reels/application/reel_publish_job.dart:681` | WORKS |
| `chat_upload_parallel` | on | `apps/mobile/lib/core/uploads/upload_queue.dart:524` | WORKS |
| `downloads_parallel` | on | `apps/mobile/lib/core/feature_flags/feature_flags_providers.dart:130` | WORKS |
| `video_cache_parallel` | on | `apps/mobile/lib/core/feature_flags/feature_flags_providers.dart:131` | WORKS |
| `payments_in_app` | off | `common/feature-flags/locked-flags.ts:8`, `apps/mobile/lib/features/case_payments/application/case_payments_providers.dart:17` | WORKS (locked off) |
| `chat_translate` | off | `modules/translation/translation.service.ts:74`, `apps/mobile/lib/features/chat/presentation/chat_translation.dart:54` | WORKS (off on prod; master switch for all translation) |
| `payroll_stripe_payouts` | off | `modules/admin-payroll/payroll-stripe.service.ts:56` | WORKS |
| `auto_bar_check` | on | `modules/verification/providers/bar-lookup/auto-bar-lookup.provider.ts` | DEAD → FIXED (#844, wired as the master) |
| `news_posts` | off | `modules/posts/posts.service.ts:166`, `apps/mobile/lib/features/feed/application/news_flag.dart:8` | WORKS |
| `phone_login` | on | `apps/mobile/lib/features/auth/presentation/screens/email_screen.dart:83` | WORKS |
| `demo_code_login` | on | `apps/mobile/lib/features/auth/presentation/screens/welcome_screen.dart:272` | BROKEN → FIXED (#844 demo replay) |
| `spotlight_indexing` | on | `apps/mobile/lib/core/platform/spotlight_index.dart:107` | WORKS |
| `guest_browsing` | on | `apps/mobile/lib/core/session/guest_mode.dart:19` | WORKS |
| `in_app_review` | on | `apps/mobile/lib/core/platform/review_prompter.dart:35` | WORKS |
| `role_switch` | on | `modules/users/services/role-switch.service.ts:100`, `apps/mobile/lib/features/settings/account/application/account_providers.dart:20` | WORKS |
| `password_login` | on | `modules/users/services/onboarding.service.ts:203` | WORKS |
| `email_login` | off | `modules/auth/services/login-method-policy.service.ts:4`, `apps/mobile/lib/core/feature_flags/feature_flags_providers.dart:175` | WORKS |
| `apple_login` | off | `modules/auth/services/login-method-policy.service.ts:16` | WORKS (API only; no button in the app) |
| `google_login` | off | `modules/auth/services/login-method-policy.service.ts:17` | WORKS (API only; no button in the app) |
| `passkey_login` | off | `apps/mobile/lib/features/auth/application/passkeys_providers.dart:18` | WORKS (off); strong-auth lock-out FIXED (#844) |
| `dispute_auto_refund` | off | `modules/billing/dispute-refund.service.ts:84` | WORKS |

### C. Every integration card (provider registry, `apps/api/src/common/secrets/provider-registry.ts`)

Cards are resolved at run time by `common/secrets/secrets.service.ts:243`. The card's own «Ключ
включён» switch is honoured there (`:250`). A card's contents cannot be read from outside, so
«prod» shows only what is visible without logging in to the admin.

| card | runtime reader | prod evidence | status |
|---|---|---|---|
| `twilio` | `config/provider-selection.ts:105`, `modules/auth/providers/sms/twilio-sms.provider.ts:172` | SMS_PROVIDER=twilio; «SMS provider selected at boot» | WORKS |
| `ses` | `config/provider-selection.ts:116`, `modules/auth/providers/email/email-provider.factory.ts:119` | EMAIL_PROVIDER=ses; owner address not verified («Email address is not verified») | WORKS for users; NOT CONFIGURED for owner alerts (§6.1) |
| `fcm` | `modules/notifications/push/fcm-push.sender.ts:472`, `modules/auth/app-check/app-check.service.ts:106` | FCM_PROJECT_ID/CLIENT_EMAIL set; pushes go out; one device gets 400 | WORKS; one device BROKEN, now logged (#844) |
| `apns` | `modules/notifications/push/apns-voip.sender.ts:400` | — | see #838 calls |
| `turn`, `cloudflare_turn`, `cloudflare_sfu`, `livekit` | `modules/calls/*`, `common/ops/status/status-probes.service.ts` | TURN_ONDEMAND_INSTANCE_ID empty | see #838 calls |
| `bunny_stream` | `modules/videos/*` | video playback works | WORKS (uploads were paused by the guard 06:10–19:52 UTC) |
| `cloudflare_r2`, `storage` | `modules/files/storage/s3-storage.service.ts:242` | bootstrap `media.public_store=r2` | see #841 media |
| `google_translate` | `modules/translation/translation.service.ts:77`, `feature-flags/services/bootstrap.service.ts:305` | `chat_translate` off | WORKS (off); key presence not visible |
| `stripe` | `modules/billing/dynamic-payment.provider.ts:29` | payments off | no-op until payments are switched on |
| `opensearch` | `modules/search/search-switch.provider.ts:98`, `modules/admin-config/admin-config.service.ts:265` | OPENSEARCH_URL empty | NOT CONFIGURED (Postgres search works) |
| `turnstile` | `modules/auth/app-check/app-check.guard.ts:254` | no `turnstile.site_key` in bootstrap | NOT CONFIGURED |
| `google_signin`, `apple_signin` | `modules/auth/social/google-token-verifier.service.ts:43`, `modules/auth/social/apple-token-verifier.service.ts:47` | `google_login` / `apple_login` off; no buttons in the app | inert |
| `google_calendar`, `microsoft_calendar` | `modules/calendar/calendar-config.service.ts:72` | `calendar.google_enabled` / `microsoft_enabled` off by default | inert |
| `ny_registry` (and state registries) | `modules/verification/providers/bar-lookup/ny-open-data.adapter.ts:48` | — | WORKS (code), switched per state |
| `aws_rekognition` | `modules/media-moderation/image-moderation.provider.ts:45` | — | WORKS (code); presence not visible |
| `aws_location`, `google_places` | `modules/addresses/address-providers.ts:76,152` | — | WORKS (code) |
| `openai_moderation` | `modules/moderation/text-detector.service.ts:42` | `moderation.detect.mode` default off | inert; a missing key would silently allow all text |
| `anthropic` | `modules/staff-ai/staff-ai-client.service.ts:36` | — | WORKS (code), staff AI only |
| `photodna`, `ncmec` | `modules/media-moderation/csam.adapters.ts:45,116` | — | NCMEC is a stub (§5.5) |
| `sentry` | `telemetry/sentry.ts:45`, `feature-flags/services/bootstrap.service.ts:334` | no `sentry.mobile_dsn` in prod bootstrap | NOT CONFIGURED (the app and admin have no Sentry; the own crash endpoint works) |
| `github`, `github_infra`, `pagerduty`, `cockroach_cloud` | `common/ops/launch/*`, `modules/admin-launch/infra/infra-github.client.ts:54`, `modules/admin-ops/system-health.service.ts:547` | — | admin/ops only; see #843 automation |
| `persona` | none (ID checks are manual by owner decision) | — | DEAD card (§5.7) |

### A. Every app_config setting (668 keys)

`WORKS (code)` means a reader sits on the service, job or app path (file:line below). Its prod value is stored in the database and cannot be read from outside without an admin login. `ref` points to the helper PR that audited that area in depth.

Totals: WORKS: 624, by design: 11, NOT CONFIGURED: 9, DEAD: 7, inert: 5, FIXED: 4, NOT CONFIGURED?: 3, DEAD for users: 2, BROKEN: 1, WORKS as monitor: 1, partly DEAD: 1

| key | reader (file:line, API paths relative to apps/api/src) | status | ref |
|---|---|---|---|
| `account.role_switch_per_day` | `modules/users/services/role-switch.service.ts:80`, `modules/users/services/role-switch.service.ts:324` | WORKS (code) |  |
| `addresses.autocomplete_enabled` | `common/ops/cost-registry.ts:1916`, `modules/admin-config/config-schema.ts:622` | WORKS (code) |  |
| `addresses.monthly_cap` | `common/ops/cost-registry.ts:1922`, `modules/admin-config/config-schema.ts:634` | WORKS (code) |  |
| `addresses.per_user_per_day` | `modules/admin-config/config-schema.ts:641`, `modules/admin-config/config-schema.ts:642` | WORKS (code) |  |
| `addresses.provider` | `modules/admin-config/config-schema.ts:628`, `modules/admin-config/config-schema.ts:629` | WORKS (code) |  |
| `admin.access_report_enabled` | `modules/admin-config/config-schema.ts:1238`, `modules/admin-config/config-schema.ts:1239` | WORKS (code) |  |
| `admin.audit_export_enabled` | `modules/admin-config/config-schema.ts:1233`, `modules/admin-config/config-schema.ts:1234` | NOT CONFIGURED (ADMIN_AUDIT_EXPORT_BUCKET empty) |  |
| `admin.country_allowlist` | `modules/staff-security/staff-security.service.ts:254`, `modules/admin-config/config-schema.ts:1208` | WORKS (code) |  |
| `admin.ip_allowlist` | `modules/admin-auth/admin-security.service.ts:58`, `modules/admin-auth/admin-security.service.ts:80` | WORKS (code) |  |
| `admin.ip_allowlist_enabled` | `modules/admin-auth/admin-security.service.ts:57`, `modules/admin-auth/admin-security.service.ts:78` | WORKS (code) |  |
| `admin.login_alert_enabled` | `modules/admin-auth/admin-security.service.ts:164`, `modules/admin-config/config-schema.ts:1214` | NOT CONFIGURED (owner address not verified in SES) |  |
| `admin.max_concurrent_sessions` | `modules/admin-auth/admin-security.service.ts:106`, `modules/admin-config/config-schema.ts:1219` | WORKS (code) |  |
| `admin.private_stepup_seconds` | `modules/admin-content/admin-private-content.service.ts:121`, `modules/admin-content/admin-private-content.service.ts:128` | WORKS (code) |  |
| `admin.reason_required_areas` | `modules/admin-auth/admin-auth.service.ts:736`, `modules/admin-auth/admin-auth.guard.ts:404` | WORKS (code) |  |
| `assistants.max_duties` | `modules/assistants/assistants.service.ts:95`, `modules/assistants/assistants.service.ts:102` | WORKS (code) |  |
| `auth.additional_identifiers_enabled` | `modules/auth/auth.service.ts:1374` | WORKS (code) |  |
| `bid_packs.refund_revokes_enabled` | `modules/bid-packs/bid-packs.service.ts:177` | WORKS (code) |  |
| `bids.bayes_prior` | `modules/cases/case-bids/case-bids.service.ts:151` | WORKS (code) |  |
| `bids.bayes_weight` | `modules/cases/case-bids/case-bids.service.ts:152` | WORKS (code) |  |
| `bids.best_match.completed` | `modules/cases/case-bids/case-bids.service.ts:150` | WORKS (code) |  |
| `bids.best_match.price` | `modules/cases/case-bids/case-bids.service.ts:149` | WORKS (code) |  |
| `bids.best_match.rating` | `modules/cases/case-bids/case-bids.service.ts:146` | WORKS (code) |  |
| `bids.best_match.speed` | `modules/cases/case-bids/case-bids.service.ts:148` | WORKS (code) |  |
| `bids.best_match.trust` | `modules/cases/case-bids/case-bids.service.ts:147` | WORKS (code) |  |
| `bids.confirmation_reminder_days` | `modules/admin-config/config-schema.ts:1003`, `jobs/handlers/case-lifecycle.jobs.ts:403` | WORKS (code) |  |
| `bids.confirmation_required` | `modules/deals/deal-records.service.ts:162`, `modules/feature-flags/services/bootstrap.service.ts:158` | WORKS (code) |  |
| `bids.default_sort` | `modules/cases/case-bids/case-bids.service.ts:176` | WORKS (code) |  |
| `bids.dumping_guard` | `modules/cases/case-bids/case-bids.service.ts:224` | WORKS (code) |  |
| `bids.low_ratio` | `modules/cases/case-bids/case-bids.service.ts:153` | WORKS (code) |  |
| `bids.min_bids_for_price` | `modules/cases/case-bids/case-bids.service.ts:154` | WORKS (code) |  |
| `bids.rich_terms_enabled` | `common/errors/error-code.enum.ts:595`, `modules/feature-flags/services/bootstrap.service.ts:157` | WORKS (code) |  |
| `billing.admin_refund_by_invoice_enabled` | `modules/admin-billing/subscription-admin.service.ts:206`, `modules/admin-billing/subscription-admin.service.ts:211` | WORKS (code) |  |
| `billing.cancel_on_verification_loss` | `modules/admin-config/config-schema.ts:672`, `modules/admin-config/config-schema.ts:673` | WORKS (code) |  |
| `billing.dispute_auto_cancel` | `modules/admin-config/config-schema.ts:682`, `modules/admin-config/config-schema.ts:683` | WORKS (code) |  |
| `billing.dispute_refund_daily_cap_cents` | `modules/admin-config/config-schema.ts:706`, `modules/admin-config/config-schema.ts:707` | WORKS (code) |  |
| `billing.dispute_refund_max_cents` | `modules/admin-config/config-schema.ts:692`, `modules/admin-config/config-schema.ts:693` | WORKS (code) |  |
| `billing.dispute_refund_user_limit` | `modules/admin-config/config-schema.ts:697`, `modules/admin-config/config-schema.ts:698` | WORKS (code) |  |
| `billing.dispute_refund_window_days` | `modules/admin-config/config-schema.ts:702`, `modules/admin-config/config-schema.ts:703` | WORKS (code) |  |
| `billing.duplicate_autorefund_daily_cap_cents` | `modules/admin-config/config-schema.ts:687`, `modules/admin-config/config-schema.ts:688` | WORKS (code) |  |
| `billing.duplicate_subscription_autofix` | `modules/admin-config/config-schema.ts:677`, `modules/admin-config/config-schema.ts:678` | WORKS (code) |  |
| `billing.had_payment_invoices_only_enabled` | `modules/billing/subscription-sync.service.ts:278` | WORKS (code) |  |
| `billing.invoice_retry_unknown_subscription_enabled` | `modules/billing/subscription-sync.service.ts:797`, `modules/billing/subscription-sync.service.ts:807` | WORKS (code) |  |
| `billing.max_assistant_seats` | `modules/assistants/assistants.service.ts:71`, `modules/admin-config/config-schema.ts:365` | WORKS (code) |  |
| `billing.partial_refund_ledger_enabled` | `modules/billing/subscription-sync.service.ts:760`, `modules/billing/subscription-sync.service.ts:768` | WORKS (code) |  |
| `billing.require_verified_for_purchases` | `modules/bid-packs/bid-packs.service.ts:205`, `modules/bid-packs/bid-packs.service.ts:222` | WORKS (code) |  |
| `billing.stripe_tax_enabled` | `modules/admin-config/config-schema.ts:716`, `modules/admin-config/config-schema.ts:717` | WORKS (code) |  |
| `billing.trial_days` | `modules/admin-config/config-schema.ts:1190`, `modules/admin-config/config-schema.ts:1191` | WORKS (code) |  |
| `cache.attorney_profile_sec` | `modules/profiles/services/attorney-profiles.service.ts:553`, `modules/profiles/services/attorney-profiles.service.ts:557` | WORKS (code) | #839 caching |
| `cache.cheap_etag_sec` | `common/sync/version-etag.service.ts:15`, `common/sync/version-etag.service.ts:34` | WORKS (code) | #839 caching |
| `cache.limit_mb.chat_media` | `apps/mobile/lib/core/cache/cache_limits.dart:85 (built name)` | WORKS (code) | #839 caching |
| `cache.limit_mb.feed` | `apps/mobile/lib/core/cache/cache_limits.dart:85 (built name)` | WORKS (code) | #839 caching |
| `cache.limit_mb.files` | `apps/mobile/lib/core/cache/cache_limits.dart:85 (built name)` | WORKS (code) | #839 caching |
| `cache.limit_mb.http` | `apps/mobile/lib/core/cache/cache_limits.dart:85 (built name)` | WORKS (code) | #839 caching |
| `cache.limit_mb.images` | `apps/mobile/lib/core/cache/cache_limits.dart:85 (built name)` | WORKS (code) | #839 caching |
| `cache.limit_mb.messages` | `apps/mobile/lib/core/cache/cache_limits.dart:85 (built name)` | WORKS (code) | #839 caching |
| `cache.limit_mb.video` | `apps/mobile/lib/core/media/video_cache/video_cache.dart:53` | WORKS (code) | #839 caching |
| `cache.max_ttl_sec` | `redis/cache-redis-mode.ts:59`, `common/cache/cached.ts:36` | WORKS (code) | #839 caching |
| `cache.redis_mode` | `redis/cache-redis-mode.ts:12`, `redis/cache-redis-mode.ts:56` | WORKS (code) | #839 caching |
| `calendar.busy_cache_seconds` | `modules/calendar/calendar-config.service.ts:82`, `modules/calendar/calendar-busy.service.ts:18` | WORKS (code) |  |
| `calendar.busy_timeout_ms` | `modules/calendar/calendar-config.service.ts:87`, `modules/calendar/calendar-busy.service.ts:19` | WORKS (code) |  |
| `calendar.feed_enabled` | `modules/calendar/calendar-config.service.ts:59`, `modules/calendar/ics-feed.service.ts:102` | WORKS (code) |  |
| `calendar.google_enabled` | `modules/calendar/calendar-config.service.ts:65`, `common/secrets/provider-registry.ts:965` | WORKS (code) |  |
| `calendar.microsoft_enabled` | `modules/calendar/calendar-config.service.ts:66`, `common/secrets/provider-registry.ts:995` | WORKS (code) |  |
| `calls.max_participants` | `modules/calls/calls.service.ts:245`, `modules/calls/calls.service.ts:1637` | WORKS (code) | #838 calls |
| `calls.own_turn.mode` | `modules/calls/calls.service.ts:348`, `common/ops/cost-registry.ts:1229` | WORKS (code) | #838 calls |
| `calls.relay_signal_filter` | `modules/admin-config/config-schema.ts:202`, `modules/realtime/realtime.gateway.ts:1453` | WORKS (code) | #838 calls |
| `calls.sfu_fallback_mesh_max` | `modules/calls/calls.service.ts:577`, `modules/calls/calls.service.ts:1665` | WORKS (code) | #838 calls |
| `calls.sfu_max_participants` | `modules/calls/calls.service.ts:1635`, `modules/calls/calls.service.ts:1650` | WORKS (code) | #838 calls |
| `calls.solo_end_seconds` | `modules/calls/calls.service.ts:2972`, `modules/calls/calls.service.ts:2976` | WORKS (code) | #838 calls |
| `calls.transport` | `modules/calls/calls.service.ts:300`, `modules/calls/calls.service.ts:347` | WORKS (code) | #838 calls |
| `calls.transport_fail_limit` | `modules/calls/cloudflare-transport.ts:36`, `modules/calls/cloudflare-transport.ts:180` | WORKS (code) | #838 calls |
| `calls.transport_fail_window_sec` | `modules/calls/cloudflare-transport.ts:36`, `modules/calls/cloudflare-transport.ts:182` | WORKS (code) | #838 calls |
| `calls.transport_report_min` | `modules/calls/cloudflare-transport.ts:61`, `modules/calls/cloudflare-transport.ts:195` | WORKS (code) | #838 calls |
| `calls.transport_report_ratio_pct` | `modules/calls/cloudflare-transport.ts:62`, `modules/calls/cloudflare-transport.ts:195` | WORKS (code) | #838 calls |
| `calls.video_provider` | `config/env.schema.ts:943`, `modules/calls/calls.service.ts:245` | WORKS (code) | #838 calls |
| `case.max_practices` | `modules/cases/cases.service.ts:1566`, `modules/cases/cases.service.ts:1577` | WORKS (code) |  |
| `case_alerts.default_enabled` | `modules/notifications/notification-rules.ts:43`, `modules/notifications/case-fanout/case-audience.service.ts:82` | WORKS (code) |  |
| `case_alerts.realert_enabled` | `modules/cases/cases.service.ts:1283`, `modules/cases/cases.service.ts:1303` | WORKS (code) |  |
| `case_alerts.rebroadcast_enabled` | `jobs/handlers/case-rebroadcast.job.ts:38`, `jobs/handlers/case-rebroadcast.job.ts:52` | WORKS (code) |  |
| `case_alerts.rebroadcast_first_hours` | `jobs/handlers/case-rebroadcast.job.ts:26`, `jobs/handlers/case-rebroadcast.job.ts:58` | WORKS (code) |  |
| `case_alerts.rebroadcast_second_hours` | `jobs/handlers/case-rebroadcast.job.ts:59`, `jobs/handlers/case-rebroadcast.job.ts:75` | WORKS (code) |  |
| `case_alerts.urgent_fast_enabled` | `modules/notifications/push/push-dispatcher.ts:667`, `modules/notifications/push/push-dispatcher.ts:668` | WORKS (code) |  |
| `case_alerts.urgent_upgrade_enabled` | `modules/cases/cases.service.ts:1050`, `modules/cases/cases.service.ts:1071` | WORKS (code) |  |
| `case_comments.edit_max_edits` | `modules/case-comments/case-comments.service.ts:161`, `modules/case-comments/case-comments.service.ts:177` | WORKS (code) |  |
| `case_comments.edit_window_minutes` | `modules/case-comments/case-comments.service.ts:160`, `modules/case-comments/case-comments.service.ts:176` | WORKS (code) |  |
| `case_fanout.daily_cap` | `modules/notifications/case-fanout/case-fanout.settings.ts:44`, `modules/notifications/case-fanout/case-fanout.settings.ts:79` | WORKS (code) |  |
| `case_fanout.enabled` | `modules/notifications/case-fanout/case-fanout.settings.ts:35`, `modules/notifications/case-fanout/case-fanout.settings.ts:67` | WORKS (code) |  |
| `case_fanout.first_wave_size` | `modules/notifications/case-fanout/case-fanout.settings.ts:36`, `modules/notifications/case-fanout/case-fanout.settings.ts:68` | WORKS (code) |  |
| `case_fanout.fraud_delay_minutes` | `modules/notifications/case-fanout/case-fanout.settings.ts:48`, `modules/notifications/case-fanout/case-fanout.settings.ts:92` | WORKS (code) |  |
| `case_fanout.fraud_restricted_action` | `modules/notifications/case-fanout/case-fanout.settings.ts:85` | WORKS (code) |  |
| `case_fanout.fraud_review_action` | `modules/notifications/case-fanout/case-fanout.settings.ts:81` | WORKS (code) |  |
| `case_fanout.fraud_small_wave_size` | `modules/notifications/case-fanout/case-fanout.settings.ts:47`, `modules/notifications/case-fanout/case-fanout.settings.ts:90` | WORKS (code) |  |
| `case_fanout.legacy_fraud_gate_enabled` | `modules/notifications/case-fanout/case-fanout.settings.ts:51`, `modules/notifications/case-fanout/case-fanout.settings.ts:99` | WORKS (code) |  |
| `case_fanout.max_waves` | `modules/notifications/case-fanout/case-fanout.settings.ts:39`, `modules/notifications/case-fanout/case-fanout.settings.ts:74` | WORKS (code) |  |
| `case_fanout.new_max_alerts` | `modules/notifications/case-fanout/case-fanout.settings.ts:42`, `modules/notifications/case-fanout/case-fanout.settings.ts:77` | WORKS (code) |  |
| `case_fanout.new_max_bids` | `modules/notifications/case-fanout/case-fanout.settings.ts:43`, `modules/notifications/case-fanout/case-fanout.settings.ts:78` | WORKS (code) |  |
| `case_fanout.new_quota_percent` | `modules/notifications/case-fanout/case-fanout.settings.ts:41`, `modules/notifications/case-fanout/case-fanout.settings.ts:76` | WORKS (code) |  |
| `case_fanout.queue_mode` | `modules/notifications/case-fanout/case-fanout.service.ts:218`, `modules/notifications/case-fanout/case-fanout.settings.ts:49` | WORKS (code) |  |
| `case_fanout.stop_at_bids` | `modules/notifications/case-fanout/case-fanout.settings.ts:40`, `modules/notifications/case-fanout/case-fanout.settings.ts:75` | WORKS (code) |  |
| `case_fanout.wave_interval_minutes` | `modules/notifications/case-fanout/case-fanout.settings.ts:38`, `modules/notifications/case-fanout/case-fanout.settings.ts:72` | WORKS (code) |  |
| `case_fanout.wave_size` | `modules/notifications/case-fanout/case-fanout.settings.ts:37`, `modules/notifications/case-fanout/case-fanout.settings.ts:69` | WORKS (code) |  |
| `case_tools.invoice_default_due_days` | `modules/cases/tools/case-tools.settings.ts:47` | WORKS (code) |  |
| `case_tools.invoice_late_fee_grace_days` | `modules/cases/tools/case-tools.settings.ts:52` | WORKS (code) |  |
| `case_tools.invoice_late_fee_percent` | `modules/cases/tools/case-tools.settings.ts:51` | WORKS (code) |  |
| `case_tools.invoice_max_reminders` | `modules/cases/tools/case-tools.settings.ts:50` | WORKS (code) |  |
| `case_tools.invoice_overdue_remind_every_days` | `modules/cases/tools/case-tools.settings.ts:49` | WORKS (code) |  |
| `case_tools.invoice_reminder_days` | `modules/cases/tools/case-tools.settings.ts:48` | WORKS (code) |  |
| `case_tools.reminders.daily_cap` | `modules/cases/tools/case-tools.settings.ts:46` | WORKS (code) |  |
| `case_tools.reminders.mode` | `modules/cases/tools/case-tools.settings.ts:45` | WORKS (code) |  |
| `case_tools.sign_expiry_days` | `modules/cases/tools/case-tools.settings.ts:53` | WORKS (code) |  |
| `case_tools.sign_max_reminders` | `modules/cases/tools/case-tools.settings.ts:55` | WORKS (code) |  |
| `case_tools.sign_reminder_every_days` | `modules/cases/tools/case-tools.settings.ts:54` | WORKS (code) |  |
| `case_tools.sign_resend_cooldown_minutes` | `modules/cases/tools/case-tools.settings.ts:56` | WORKS (code) |  |
| `cases.close_confirm_days` | `modules/cases/domain/case-state-machine.ts:187`, `modules/cases/domain/case-state-machine.ts:197` | WORKS (code) |  |
| `cases.deadline_reminder_days` | `modules/admin-config/config-schema.ts:405`, `modules/admin-config/config-schema.ts:406` | WORKS (code) |  |
| `cases.deadline_reminders_auto` | `jobs/handlers/case-deadline-reminder.job.ts:53`, `jobs/handlers/case-deadline-reminder.job.ts:70` | WORKS (code) |  |
| `cases.stale_archive_after_pause_days` | `jobs/handlers/case-lifecycle.jobs.ts:218`, `modules/cases/domain/case-staleness.ts:99` | WORKS (code) |  |
| `cases.stale_ask_days_flexible` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_ask_days_soon` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_ask_days_urgent` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_ask_days_very_urgent` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_ask_days_within_month` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_pause_days_by_date` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_pause_days_flexible` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_pause_days_soon` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_pause_days_urgent` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_pause_days_very_urgent` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.stale_pause_days_within_month` | `modules/cases/domain/case-staleness.ts:74 (built name)` | WORKS (code) |  |
| `cases.urgency_days_soon` | `modules/cases/domain/case-urgency.ts:354` | WORKS (code) |  |
| `cases.urgency_days_urgent` | `modules/cases/domain/case-urgency.ts:353` | WORKS (code) |  |
| `cases.urgency_days_very_urgent` | `modules/cases/domain/case-urgency.ts:352` | WORKS (code) |  |
| `cases.urgency_days_within_month` | `modules/cases/domain/case-urgency.ts:355` | WORKS (code) |  |
| `cdn.invalidate_batch_paths` | `jobs/handlers/cdn-invalidate.job.ts:61` | WORKS (code) | #841 media |
| `cdn.invalidate_max_paths_day` | `jobs/handlers/cdn-invalidate.job.ts:69` | WORKS (code) | #841 media |
| `cdn.invalidate_max_paths_month` | `jobs/handlers/cdn-invalidate.job.ts:64`, `modules/files/storage/cdn-invalidation.ts:16` | WORKS (code) | #841 media |
| `cdn.invalidate_on_delete` | `jobs/handlers/cdn-invalidate.job.ts:25`, `jobs/handlers/cdn-invalidate.job.ts:57` | WORKS (code) | #841 media |
| `channels.max_admins` | `modules/channels/channels.service.ts:567` | WORKS (code) |  |
| `channels.max_owned` | `modules/channels/channels.service.ts:319`, `modules/admin-config/config-schema.ts:391` | WORKS (code) |  |
| `channels.max_post_media` | `modules/channels/channels.service.ts:709`, `modules/feature-flags/services/bootstrap.service.ts:163` | FIXED (#844, app side) |  |
| `chat.delete_for_all_hours` | `modules/chat/chat-actions.service.ts:267`, `modules/chat/chat-actions.service.ts:448` | WORKS (code) |  |
| `chat.edit_window_min` | `modules/chat/chat-actions.service.ts:151`, `modules/chat/chat-actions.service.ts:447` | WORKS (code) |  |
| `chat.link_preview_denylist` | `modules/link-preview/link-preview.service.ts:52` | WORKS (code) |  |
| `chat.link_preview_enabled` | `modules/admin-config/config-schema.ts:615`, `modules/admin-config/config-schema.ts:616` | WORKS (code) |  |
| `chat.link_preview_per_user_per_day` | `modules/admin-config/config-schema.ts:647`, `modules/admin-config/config-schema.ts:648` | WORKS (code) |  |
| `chat.max_pins` | `modules/chat/chat-actions.service.ts:414`, `modules/chat/chat-actions.service.ts:449` | WORKS (code) |  |
| `chat.search.backfill_batch` | `modules/admin-config/config-schema.ts:1142`, `modules/admin-config/config-schema.ts:1143` | WORKS (code) |  |
| `chat.search.backfill_mode` | `modules/admin-config/config-schema.ts:1124`, `modules/admin-config/config-schema.ts:1125` | WORKS (code) |  |
| `chat.search.backfill_rows_per_run` | `modules/admin-config/config-schema.ts:1130`, `modules/admin-config/config-schema.ts:1131` | WORKS (code) |  |
| `chat.search.max_tokens_per_message` | `modules/admin-config/config-schema.ts:1135`, `modules/admin-config/config-schema.ts:1136` | WORKS (code) |  |
| `chat.search.prefix_tokens` | `common/secrets/message-search-index.ts:277`, `common/secrets/message-search-index.ts:342` | WORKS (code) |  |
| `compliance.age_gate.min_age` | `modules/compliance/age-gate.service.ts:38`, `modules/admin-config/config-schema.ts:530` | WORKS (code) |  |
| `compliance.age_gate.mode` | `modules/compliance/age-gate.service.ts:37`, `modules/admin-config/config-schema.ts:524` | WORKS (code) |  |
| `compliance.age_gate.require_birth_date` | `modules/compliance/age-gate.service.ts:40` | WORKS (code) |  |
| `compliance.age_gate.text_version` | `modules/compliance/age-gate.service.ts:39` | WORKS (code) |  |
| `compliance.email.footer_address` | `modules/compliance/compliance-email.provider.ts:42`, `modules/compliance/compliance-email.provider.ts:95` | WORKS (code) |  |
| `compliance.sms.disclosure_text` | `modules/compliance/sms-compliance.service.ts:64` | DEAD (app shows a fixed text) |  |
| `compliance.sms.disclosure_version` | `modules/compliance/sms-compliance.service.ts:63` | DEAD (app shows a fixed text) |  |
| `compliance.sms.help_text` | `modules/compliance/sms-compliance.service.ts:228` | NOT CONFIGURED? (Twilio inbound webhook not verified) |  |
| `compliance.sms.marketing_enabled` | `modules/compliance/sms-compliance.service.ts:278` | DEAD (no caller; harmless) |  |
| `compliance.sms.quiet_end_hour` | `modules/compliance/sms-compliance.service.ts:288`, `modules/admin-config/config-schema.ts:540` | DEAD (no caller; harmless) |  |
| `compliance.sms.quiet_start_hour` | `modules/compliance/sms-compliance.service.ts:287`, `modules/admin-config/config-schema.ts:535` | DEAD (no caller; harmless) |  |
| `compliance.sms.reply_to_help` | `modules/compliance/sms-compliance.service.ts:227` | NOT CONFIGURED? (Twilio inbound webhook not verified) |  |
| `compliance.sns.topic_arns` | `modules/compliance/ses-webhook.service.ts:38` | WORKS (code) |  |
| `consultations.max_active_per_client` | `modules/consultations/consultations.service.ts:458` | WORKS (code) |  |
| `consultations.no_show_auto_detect` | `modules/calendar/no-show.service.ts:311` | WORKS (code) |  |
| `consultations.no_show_dispute_hours` | `modules/calendar/no-show.service.ts:112`, `modules/calendar/no-show.service.ts:344` | WORKS (code) |  |
| `consultations.no_show_enabled` | `modules/calendar/no-show.service.ts:245`, `modules/calendar/no-show.service.ts:535` | WORKS (code) |  |
| `consultations.no_show_grace_minutes` | `modules/calendar/no-show.service.ts:110`, `modules/calendar/no-show.service.ts:246` | WORKS (code) |  |
| `consultations.no_show_mark_hours` | `modules/calendar/no-show.service.ts:111`, `modules/calendar/no-show.service.ts:247` | WORKS (code) |  |
| `contacts.suspend_after_confirmed_reports` | `modules/admin-cases/admin-cases.dto.ts:158`, `modules/admin-cases/admin-cases.service.ts:170` | WORKS (code) |  |
| `counters.drift_sweep` | `jobs/handlers/counters-reconcile.job.ts:14`, `jobs/handlers/counters-reconcile.job.ts:30` | WORKS (code) | #843 automation |
| `counters.drift_sweep_batch` | `jobs/handlers/counters-reconcile.job.ts:33` | WORKS (code) | #843 automation |
| `countries.notify_waitlist` | `modules/countries/admin-countries.service.ts:83`, `modules/countries/admin-countries.service.ts:222` | WORKS (code) |  |
| `db.bloat_mode` | `modules/admin-config/config-schema.ts:823`, `modules/admin-config/config-schema.ts:824` | WORKS (code) | #843 automation |
| `db.bloat_scan_max_mb` | `modules/admin-config/config-schema.ts:829`, `modules/admin-config/config-schema.ts:830` | WORKS (code) | #843 automation |
| `db.health_dead_ratio_percent` | `jobs/handlers/db-health.job.ts:85`, `jobs/handlers/db-health.job.ts:115` | WORKS (code) | #843 automation |
| `db.health_mode` | `jobs/handlers/db-health.job.ts:104` | WORKS (code) | #843 automation |
| `db.health_table_size_gb` | `jobs/handlers/db-health.job.ts:84`, `jobs/handlers/db-health.job.ts:114` | WORKS (code) | #843 automation |
| `db.replica_max_lag_ms` | `prisma/prisma-read.service.ts:67`, `prisma/prisma-read.service.ts:81` | WORKS (code) | #843 automation |
| `db.replica_provision` | `prisma/replica-admin.service.ts:138`, `prisma/replica-admin.service.ts:149` | WORKS (code) | #843 automation |
| `db.replica_reads` | `prisma/prisma-read.service.ts:65`, `prisma/prisma-read.service.ts:79` | WORKS (code) | #843 automation |
| `deal_record.enabled` | `common/errors/error-code.enum.ts:585`, `modules/deals/deal-records.controller.ts:76` | WORKS (code) |  |
| `economy.aws_fallback_usd` | `modules/admin-economy/admin-economy.controller.ts:82`, `common/economy/economy.service.ts:237` | WORKS; rule needs owner decision (§1, §5.1) | #843 automation |
| `economy.ceiling_mode` | `modules/admin-economy/admin-economy.controller.ts:78`, `modules/admin-config/config-schema.ts:1149` | WORKS (code) | #843 automation |
| `economy.daily_brake_days` | `modules/admin-economy/admin-economy.controller.ts:81`, `common/economy/economy.service.ts:238` | WORKS; rule needs owner decision (§1, §5.1) | #843 automation |
| `economy.manual_api_max` | `modules/admin-economy/admin-economy.controller.ts:79`, `modules/admin-config/config-schema.ts:1170` | WORKS (code) | #843 automation |
| `economy.manual_worker_max` | `modules/admin-economy/admin-economy.controller.ts:80`, `modules/admin-config/config-schema.ts:1170` | WORKS (code) | #843 automation |
| `economy.max_spend_percent` | `modules/admin-economy/admin-economy.controller.ts:76`, `common/ops/cost-registry.ts:506` | WORKS; rule needs owner decision (§1, §5.1) | #843 automation |
| `economy.min_threshold_usd` | `modules/admin-economy/admin-economy.controller.ts:77`, `common/economy/economy.service.ts:233` | WORKS; rule needs owner decision (§1, §5.1) | #843 automation |
| `events.auto_ceiling_per_day` | `modules/admin-config/config-schema.ts:132`, `modules/events/events.maintenance.ts:19` | WORKS (code) | #843 automation |
| `events.max_per_day` | `modules/admin-config/config-schema.ts:117`, `modules/events/domain-events.service.ts:23` | WORKS (code) | #843 automation |
| `events.retention_days` | `modules/admin-config/config-schema.ts:125`, `modules/events/events.maintenance.ts:21` | WORKS (code) | #843 automation |
| `events.sink` | `modules/admin-config/config-schema.ts:110`, `modules/events/events.maintenance.ts:46` | WORKS (code) | #843 automation |
| `experiments.ctr_k` | `modules/experiments/experiment-metrics.service.ts:158` | DEAD for users (§5.6) |  |
| `experiments.max_start_percent` | `modules/experiments/admin-experiments.service.ts:119` | DEAD for users (§5.6) |  |
| `feed.default_content_mode` | `modules/posts/content-filter.service.ts:21`, `modules/admin-config/config-schema.ts:1249` | WORKS (code) |  |
| `feed.reco_explore_hours` | `modules/feed/feed-reco.job.ts:51`, `modules/feed/feed-reco.job.ts:71` | WORKS (code) |  |
| `feed.reco_explore_slots` | `modules/feed/feed-reco.job.ts:51`, `modules/feed/feed-reco.job.ts:70` | WORKS (code) |  |
| `feed.reco_scan_max` | `modules/feed/feed.service.ts:61`, `modules/feed/feed.service.ts:558` | WORKS (code) |  |
| `feed.reposts_per_page` | `modules/feed/feed.service.ts:519`, `modules/feed/feed.service.ts:675` | WORKS (code) |  |
| `fees.contingency_blocked_practices` | `modules/cases/domain/contingency.ts:26`, `apps/mobile/lib/features/cases/domain/contingency.dart:7` | WORKS (code) |  |
| `fees.contingency_max_percent` | `modules/bids/dto/bid-requests.dto.ts:224`, `modules/cases/domain/contingency.ts:24` | WORKS (code) |  |
| `files.access_log_enabled` | `modules/admin-config/config-schema.ts:581`, `modules/admin-config/config-schema.ts:582` | WORKS (code) | #841 media |
| `files.access_log_sample_percent` | `modules/admin-config/config-schema.ts:587`, `modules/admin-config/config-schema.ts:588` | WORKS (code) | #841 media |
| `files.confidential_url_ttl_sec` | `modules/admin-config/config-schema.ts:574`, `modules/admin-config/config-schema.ts:575` | WORKS (code) | #841 media |
| `files.document_template_max_size_mb` | `modules/document-templates/document-templates.dto.ts:187`, `modules/files/files.policy.ts:55` | WORKS (code) | #841 media |
| `files.max_size_mb` | `modules/files/files.policy.ts:53`, `modules/files/files.policy.ts:191` | WORKS (code) | #841 media |
| `files.sticker_max_size_mb` | `modules/files/files.policy.ts:54`, `modules/files/files.policy.ts:119` | WORKS (code) | #841 media |
| `fraud.auto` | `modules/client-fraud/admin-client-fraud.service.ts:40`, `modules/client-fraud/client-fraud.service.ts:161` | WORKS (code) |  |
| `fraud.ban_score` | `modules/client-fraud/admin-client-fraud.service.ts:45`, `modules/client-fraud/admin-client-fraud.service.ts:143` | WORKS (code) |  |
| `fraud.blocked_retention_days` | `modules/client-fraud/admin-client-fraud.service.ts:52`, `modules/client-fraud/client-fraud.service.ts:173` | WORKS (code) |  |
| `fraud.device_action` | `modules/client-fraud/admin-client-fraud.service.ts:42`, `modules/client-fraud/admin-client-fraud.service.ts:140` | WORKS (code) |  |
| `fraud.enabled` | `modules/client-fraud/admin-client-fraud.service.ts:39`, `modules/client-fraud/admin-client-fraud.service.ts:133` | WORKS (code) |  |
| `fraud.fingerprint_retention_days` | `modules/client-fraud/admin-client-fraud.service.ts:51`, `modules/client-fraud/client-fraud.service.ts:172` | WORKS (code) |  |
| `fraud.match_action` | `modules/client-fraud/admin-client-fraud.service.ts:41`, `modules/client-fraud/admin-client-fraud.service.ts:139` | WORKS (code) |  |
| `fraud.notify_staff` | `modules/client-fraud/admin-client-fraud.service.ts:50`, `modules/client-fraud/client-fraud.service.ts:171` | WORKS (code) |  |
| `fraud.restrict_score` | `modules/client-fraud/admin-client-fraud.service.ts:44`, `modules/client-fraud/admin-client-fraud.service.ts:142` | WORKS (code) |  |
| `fraud.review_score` | `modules/client-fraud/admin-client-fraud.service.ts:43`, `modules/client-fraud/admin-client-fraud.service.ts:141` | WORKS (code) |  |
| `fraud.weight_chargeback` | `modules/client-fraud/admin-client-fraud.service.ts:48`, `modules/client-fraud/client-fraud.service.ts:169` | WORKS (code) |  |
| `fraud.weight_fraud_report` | `modules/client-fraud/admin-client-fraud.service.ts:46`, `modules/client-fraud/client-fraud.service.ts:167` | WORKS (code) |  |
| `fraud.weight_report` | `modules/client-fraud/admin-client-fraud.service.ts:47`, `modules/client-fraud/client-fraud.service.ts:168` | WORKS (code) |  |
| `fraud.window_days` | `modules/client-fraud/admin-client-fraud.service.ts:49`, `modules/client-fraud/client-fraud.service.ts:170` | WORKS (code) |  |
| `groups.max_members` | `modules/groups/groups.dto.ts:30`, `modules/groups/groups.service.ts:190` | WORKS (code) |  |
| `growth.shard_db_gb` | `partitioning/partition.service.ts:429`, `modules/admin-config/config-schema.ts:1297` | WORKS (code) | #843 automation |
| `growth.shard_rows` | `partitioning/partition.service.ts:430`, `modules/admin-config/config-schema.ts:1304` | WORKS (code) | #843 automation |
| `guest.browsing_enabled` | `common/app-settings/client-tuning.ts:150`, `common/app-settings/client-tuning.ts:156` | WORKS (code) |  |
| `guest.rate_limit_per_hour` | `modules/auth/guards/jwt-auth.guard.ts:84` | WORKS (code) |  |
| `guest.rate_limit_per_minute` | `modules/auth/guards/jwt-auth.guard.ts:66`, `modules/auth/guards/jwt-auth.guard.ts:83` | WORKS (code) |  |
| `ha.mode` | `modules/admin-config/config-schema.ts:553`, `modules/admin-config/config-schema.ts:553` | WORKS (code) | #843 automation |
| `ha.provision_online_users` | `modules/admin-config/config-schema.ts:558`, `modules/admin-config/config-schema.ts:559` | WORKS (code) | #843 automation |
| `ha.release_days` | `modules/admin-config/config-schema.ts:563`, `modules/admin-config/config-schema.ts:564` | WORKS (code) | #843 automation |
| `images.avif_effort` | `modules/files/processing/image-processor.ts:53` | WORKS (code) | #841 media |
| `images.avif_enabled` | `cli/backfill-avatar-variants.ts:19`, `modules/files/files.policy.ts:307` | WORKS (code) | #841 media |
| `images.avif_quality` | `modules/files/processing/image-processor.ts:52` | WORKS (code) | #841 media |
| `images.avif_since` | `modules/files/processing/image-processor.ts:69`, `modules/files/processing/image-processor.ts:77` | WORKS (code) | #841 media |
| `images.jpeg_quality` | `modules/files/processing/image-processor.ts:55` | WORKS (code) | #841 media |
| `images.webp_quality` | `modules/files/processing/image-processor.ts:54` | WORKS (code) | #841 media |
| `infra.daily_cap` | `modules/admin-launch/infra/infra-change.service.ts:201`, `modules/admin-config/config-schema.ts:958` | WORKS (code) | #843 automation |
| `infra.dry_run` | `modules/admin-launch/infra/infra-change.service.ts:200`, `modules/admin-config/config-schema.ts:952` | WORKS (code) | #843 automation |
| `infra.quiet_hours` | `modules/admin-launch/infra/infra-change.service.ts:202`, `modules/admin-launch/infra/infra-change.service.ts:320` | WORKS (code) | #843 automation |
| `invites.expiry_days` | `modules/cases/case-invites/case-invites.service.ts:79`, `modules/cases/case-invites/case-invites.service.ts:160` | WORKS (code) |  |
| `invites.max_pending_per_case` | `modules/cases/case-invites/case-invites.service.ts:79`, `modules/cases/case-invites/case-invites.service.ts:158` | WORKS (code) |  |
| `invites.max_per_attorney_per_day` | `modules/cases/case-invites/case-invites.service.ts:161` | WORKS (code) |  |
| `invites.max_per_day` | `modules/cases/case-invites/case-invites.service.ts:80`, `modules/cases/case-invites/case-invites.service.ts:159` | WORKS (code) |  |
| `invites.max_per_pair_per_day` | `modules/cases/case-invites/case-invites.service.ts:162` | WORKS (code) |  |
| `invites.reinvite_after_hours` | `modules/cases/case-invites/case-invites.service.ts:163` | WORKS (code) |  |
| `ledger.reconcile_mode` | `modules/ledger/ledger-reconcile.service.ts:305`, `modules/admin-config/config-schema.ts:65` | WORKS (code) | #843 automation |
| `ledger.reconcile_window_days` | `modules/ledger/ledger-reconcile.service.ts:314`, `modules/admin-config/config-schema.ts:72` | WORKS (code) | #843 automation |
| `legal.deleted_retention_days` | `modules/admin-data-requests/legal-export.service.ts:273`, `modules/admin-data-requests/legal-retention.service.ts:28` | WORKS (code) |  |
| `legal.disclaimer.by_state` | `modules/admin-config/config-schema.ts:1395`, `modules/admin-config/config-schema.ts:1396` | WORKS (code) |  |
| `legal.disclaimer.deadline_extra` | `common/legal-disclaimer/legal-disclaimer.interceptor.ts:77` | WORKS (code) |  |
| `legal.disclaimer.enabled` | `common/legal-disclaimer/legal-disclaimer.interceptor.ts:70` | WORKS (code) |  |
| `legal.disclaimer.template_extra` | `common/legal-disclaimer/legal-disclaimer.interceptor.ts:75` | WORKS (code) |  |
| `legal.disclaimer.text` | `common/legal-disclaimer/legal-disclaimer.interceptor.ts:72` | WORKS (code) |  |
| `legal.export_link_days` | `modules/admin-data-requests/legal-export.builder.ts:45`, `modules/admin-data-requests/legal-export.builder.ts:98` | WORKS (code) |  |
| `legal.export_max_downloads` | `modules/admin-data-requests/legal-export.service.ts:146` | WORKS (code) |  |
| `legal.export_max_rows` | `modules/admin-data-requests/legal-export.builder.ts:97` | WORKS (code) |  |
| `legal.export_ttl_days` | `modules/admin-data-requests/legal-export.builder.ts:99` | WORKS (code) |  |
| `legal.notice_template_en` | `modules/admin-data-requests/legal-request.service.ts:130` | WORKS (code) |  |
| `legal.notice_template_ru` | `modules/admin-data-requests/legal-request.service.ts:130` | WORKS (code) |  |
| `legal.preservation_days` | `modules/admin-data-requests/legal-export.service.ts:205` | WORKS (code) |  |
| `legal.reminder_days` | `jobs/handlers/legal-reminders.job.ts:19`, `jobs/handlers/legal-reminders.job.ts:39` | WORKS (code) |  |
| `legal.reminders_enabled` | `jobs/handlers/legal-reminders.job.ts:22`, `jobs/handlers/legal-reminders.job.ts:38` | WORKS (code) |  |
| `log.ws_events` | `modules/admin-config/config-schema.ts:913`, `modules/realtime/realtime.gateway.ts:270` | WORKS (code) |  |
| `log.ws_sample_percent` | `modules/admin-config/config-schema.ts:916`, `modules/admin-config/config-schema.ts:917` | WORKS (code) |  |
| `media.avatar_max_px` | `apps/mobile/lib/core/media/photo_limits.dart:6`, `apps/mobile/lib/core/media/photo_limits.dart:20` | WORKS (code) | #841 media |
| `media.avatar_quality` | `apps/mobile/lib/core/media/photo_limits.dart:26` | WORKS (code) | #841 media |
| `media.photo_max_px` | `apps/mobile/lib/core/media/photo_limits.dart:5`, `apps/mobile/lib/core/media/photo_limits.dart:12` | WORKS (code) | #841 media |
| `media.photo_quality` | `apps/mobile/lib/core/media/photo_limits.dart:5`, `apps/mobile/lib/core/media/photo_limits.dart:15` | WORKS (code) | #841 media |
| `media.public_store` | `common/ops/cost-registry.ts:1868`, `common/ops/status/status-probes.service.ts:613` | WORKS (code) | #841 media |
| `media.video_frame_rate` | `apps/mobile/lib/core/media/video_compression.dart:17`, `apps/mobile/lib/core/media/video_compression.dart:24` | WORKS (code) | #841 media |
| `media.video_max_height` | `apps/mobile/lib/core/media/video_compression.dart:16`, `apps/mobile/lib/core/media/video_compression.dart:21` | WORKS (code) | #841 media |
| `moderation.auto.account_mode` | `modules/moderation/auto-moderation.service.ts:193`, `modules/admin-config/config-schema.ts:1459` | WORKS (code) |  |
| `moderation.auto.alarm_min_appeals` | `modules/moderation/auto-moderation.service.ts:413` | WORKS (code) |  |
| `moderation.auto.alarm_overturn_percent` | `modules/moderation/auto-moderation.service.ts:412` | WORKS (code) |  |
| `moderation.auto.appeal_sla_hours` | `modules/moderation/auto-moderation.service.ts:446`, `modules/moderation/auto-appeals.service.ts:258` | WORKS (code) |  |
| `moderation.auto.borderline_factor` | `modules/moderation/auto-moderation.service.ts:157`, `modules/moderation/auto-moderation.service.ts:265` | WORKS (code) |  |
| `moderation.auto.detect_score` | `modules/moderation/auto-moderation.service.ts:97`, `modules/admin-config/config-schema.ts:1436` | WORKS (code) |  |
| `moderation.auto.limit_at` | `modules/moderation/auto-moderation.service.ts:85`, `modules/admin-config/config-schema.ts:1437` | WORKS (code) |  |
| `moderation.auto.limit_days` | `modules/moderation/auto-moderation.service.ts:269` | WORKS (code) |  |
| `moderation.auto.sla_auto_approve` | `modules/moderation/auto-appeals.service.ts:261` | WORKS (code) |  |
| `moderation.auto.strike_score` | `modules/moderation/auto-moderation.service.ts:96`, `modules/admin-config/config-schema.ts:1435` | WORKS (code) |  |
| `moderation.auto.suspend_at` | `modules/moderation/auto-moderation.service.ts:87`, `modules/admin-config/config-schema.ts:1439` | WORKS (code) |  |
| `moderation.auto.suspend_temp_at` | `modules/moderation/auto-moderation.service.ts:86`, `modules/admin-config/config-schema.ts:1438` | WORKS (code) |  |
| `moderation.auto.suspend_temp_days` | `modules/moderation/auto-moderation.service.ts:271` | WORKS (code) |  |
| `moderation.auto.verified_attorney_action` | `modules/moderation/auto-moderation.service.ts:210`, `modules/admin-config/config-schema.ts:1458` | WORKS (code) |  |
| `moderation.auto.verified_attorney_multiplier` | `modules/moderation/auto-moderation.service.ts:213`, `modules/admin-config/config-schema.ts:1440` | WORKS (code) |  |
| `moderation.auto.window_days` | `modules/moderation/auto-moderation.service.ts:95` | WORKS (code) |  |
| `moderation.auto_hide_mode` | `modules/moderation/moderation.service.ts:763`, `modules/moderation/moderation.service.ts:784` | WORKS (code) |  |
| `moderation.auto_hide_reports` | `modules/moderation/moderation.service.ts:786` | WORKS (code) |  |
| `moderation.auto_hide_score` | `modules/moderation/moderation.service.ts:767`, `modules/moderation/moderation.service.ts:820` | WORKS (code) |  |
| `moderation.auto_hold_queue_enabled` | `modules/moderation/auto-hold.service.ts:49`, `modules/moderation/auto-hold.service.ts:50` | WORKS (code) |  |
| `moderation.blocked_terms` | `modules/moderation/rule-based-moderation.hook.ts:39`, `modules/moderation/rule-based-moderation.hook.ts:68` | WORKS (code) |  |
| `moderation.csam.ncmec_submit_enabled` | `modules/media-moderation/media-moderation.service.ts:931` | BROKEN (stub, §5.5) |  |
| `moderation.detect.block_at` | `modules/moderation/text-detector.service.ts:142`, `modules/admin-config/config-schema.ts:1450` | WORKS (code) |  |
| `moderation.detect.categories` | `modules/moderation/text-detector.service.ts:140`, `modules/admin-config/config-schema.ts:1462` | WORKS (code) |  |
| `moderation.detect.daily_cap` | `modules/moderation/text-detector.service.ts:173`, `common/ops/cost-registry.ts:2002` | WORKS (code) |  |
| `moderation.detect.hold_at` | `modules/moderation/text-detector.service.ts:141`, `modules/moderation/auto-moderation.service.ts:98` | WORKS (code) |  |
| `moderation.detect.log_at` | `modules/moderation/text-detector.service.ts:143`, `modules/admin-config/config-schema.ts:1451` | WORKS (code) |  |
| `moderation.detect.mode` | `modules/moderation/text-detector.service.ts:132`, `common/ops/cost-registry.ts:1996` | WORKS (code) |  |
| `moderation.detect.provider` | `modules/moderation/text-detector.service.ts:135`, `modules/admin-config/config-schema.ts:1461` | NOT CONFIGURED? (openai_moderation key not verified) |  |
| `moderation.dismiss_restores_enabled` | `modules/moderation/admin-moderation.service.ts:391`, `modules/moderation/admin-moderation.service.ts:393` | WORKS (code) |  |
| `moderation.duplicate_min_chars` | `modules/moderation/rule-based-moderation.hook.ts:44`, `modules/moderation/rule-based-moderation.hook.ts:118` | WORKS (code) |  |
| `moderation.duplicate_window_hours` | `modules/moderation/rule-based-moderation.hook.ts:43`, `modules/moderation/rule-based-moderation.hook.ts:71` | WORKS (code) |  |
| `moderation.held_notice_enabled` | `modules/moderation/auto-hold.service.ts:62`, `modules/moderation/auto-hold.service.ts:63` | WORKS (code) |  |
| `moderation.hold_terms` | `modules/moderation/rule-based-moderation.hook.ts:40`, `modules/moderation/rule-based-moderation.hook.ts:69` | WORKS (code) |  |
| `moderation.image.enabled` | `modules/media-moderation/media-moderation.service.ts:371`, `modules/stickers/stickers.service.ts:444` | WORKS (code) |  |
| `moderation.image.hide_confidence` | `modules/media-moderation/media-moderation.service.ts:108`, `modules/media-moderation/media-moderation.service.ts:372` | WORKS (code) |  |
| `moderation.image.min_confidence` | `modules/media-moderation/media-moderation.service.ts:374` | WORKS (code) |  |
| `moderation.image.recheck_enabled` | `modules/media-moderation/media-moderation.service.ts:299`, `modules/media-moderation/media-moderation.service.ts:306` | WORKS (code) |  |
| `moderation.image.reuse_approval_enabled` | `modules/media-moderation/media-moderation.service.ts:493` | WORKS (code) |  |
| `moderation.image.review_confidence` | `modules/media-moderation/media-moderation.service.ts:373` | WORKS (code) |  |
| `moderation.max_links` | `modules/moderation/rule-based-moderation.hook.ts:41`, `modules/moderation/rule-based-moderation.hook.ts:70` | WORKS (code) |  |
| `moderation.report_abuse.enabled` | `modules/moderation/reporter-reputation.service.ts:277` | WORKS (code) |  |
| `moderation.report_abuse.min_reports` | `modules/moderation/reporter-reputation.service.ts:291` | WORKS (code) |  |
| `moderation.report_abuse.repeat_after_warning` | `modules/moderation/reporter-reputation.service.ts:293` | WORKS (code) |  |
| `moderation.report_abuse.suspend_days` | `modules/moderation/reporter-reputation.service.ts:294` | WORKS (code) |  |
| `moderation.report_abuse.unfounded_percent` | `modules/moderation/reporter-reputation.service.ts:292`, `modules/admin-config/config-schema.ts:1468` | WORKS (code) |  |
| `moderation.report_abuse.window_days` | `modules/moderation/reporter-reputation.service.ts:290` | WORKS (code) |  |
| `moderation.reports_after_restore_only_enabled` | `modules/moderation/moderation.service.ts:879`, `modules/moderation/moderation.service.ts:889` | WORKS (code) |  |
| `moderation.restore_keeps_author_delete_enabled` | `modules/moderation/moderation.service.ts:498` | WORKS (code) |  |
| `moderation.strikes.cooldown_at` | `modules/moderation/strikes.service.ts:114` | WORKS (code) |  |
| `moderation.strikes.cooldown_hours` | `modules/moderation/strikes.service.ts:286` | WORKS (code) |  |
| `moderation.strikes.cooldown_minutes` | `common/usage-limits/strike-gate.service.ts:138` | WORKS (code) |  |
| `moderation.strikes.enabled` | `modules/moderation/strikes.service.ts:93`, `modules/moderation/strikes.service.ts:268` | WORKS (code) |  |
| `moderation.strikes.expiry_days` | `modules/moderation/strikes.service.ts:113` | WORKS (code) |  |
| `moderation.strikes.limited_at` | `modules/moderation/strikes.service.ts:115` | WORKS (code) |  |
| `moderation.strikes.limited_days` | `modules/moderation/strikes.service.ts:289` | WORKS (code) |  |
| `moderation.strikes.points_hide` | `modules/moderation/strikes.service.ts:97` | WORKS (code) |  |
| `moderation.strikes.points_remove` | `modules/moderation/strikes.service.ts:96` | WORKS (code) |  |
| `moderation.strikes.suspend_at` | `modules/moderation/strikes.service.ts:116` | WORKS (code) |  |
| `moderation.strikes.suspend_days` | `modules/moderation/strikes.service.ts:291` | WORKS (code) |  |
| `moderation.verified_attorney_action` | `modules/moderation/moderation.service.ts:770`, `modules/moderation/moderation.service.ts:831` | WORKS (code) |  |
| `moderation.verified_attorney_score` | `modules/moderation/moderation.service.ts:772`, `modules/moderation/moderation.service.ts:841` | WORKS (code) |  |
| `moderation.video.frame_every_sec` | `modules/media-moderation/media-moderation.service.ts:197`, `modules/media-moderation/media-moderation.service.ts:210` | NOT CONFIGURED (ffmpeg likely missing) |  |
| `moderation.video.frames_enabled` | `modules/media-moderation/media-moderation.service.ts:195`, `modules/media-moderation/media-moderation.service.ts:206` | NOT CONFIGURED (ffmpeg likely missing) |  |
| `moderation.video.frames_max` | `modules/media-moderation/media-moderation.service.ts:198`, `modules/media-moderation/media-moderation.service.ts:211` | NOT CONFIGURED (ffmpeg likely missing) |  |
| `moderation.weight.accuracy_min_reports` | `modules/moderation/reporter-reputation.service.ts:96` | WORKS (code) |  |
| `moderation.weight.burst` | `modules/moderation/reporter-reputation.service.ts:100`, `modules/admin-config/config-schema.ts:1448` | WORKS (code) |  |
| `moderation.weight.burst_min_accounts` | `modules/moderation/reporter-reputation.service.ts:99` | WORKS (code) |  |
| `moderation.weight.burst_window_hours` | `modules/moderation/reporter-reputation.service.ts:98` | WORKS (code) |  |
| `moderation.weight.cluster_by_source` | `modules/moderation/reporter-reputation.service.ts:97` | WORKS (code) |  |
| `moderation.weight.new_account` | `modules/moderation/reporter-reputation.service.ts:93`, `modules/admin-config/config-schema.ts:1446` | WORKS (code) |  |
| `moderation.weight.new_account_days` | `modules/moderation/reporter-reputation.service.ts:92` | WORKS (code) |  |
| `moderation.weight.source_lookback_days` | `modules/moderation/reporter-reputation.service.ts:123` | WORKS (code) |  |
| `moderation.weight.unverified_contact` | `modules/moderation/reporter-reputation.service.ts:94`, `modules/admin-config/config-schema.ts:1447` | WORKS (code) |  |
| `moderation.weight.verified_reporter` | `modules/moderation/reporter-reputation.service.ts:95`, `modules/admin-config/config-schema.ts:1441` | WORKS (code) |  |
| `notifications.retention_days` | `jobs/handlers/notifications-retention.job.ts:13`, `jobs/handlers/notifications-retention.job.ts:22` | WORKS (code) |  |
| `ops.admin_summaries_mode` | `modules/admin-config/config-schema.ts:884`, `jobs/handlers/admin-summaries.job.ts:57` | WORKS (code) | #843 automation |
| `ops.auto_pause_heavy_jobs` | `modules/admin-ops/admin-ops.controller.ts:496`, `modules/admin-ops/system-health.service.ts:161` | WORKS (code) | #843 automation |
| `ops.auto_scale_down_on_budget` | `modules/admin-ops/admin-ops.controller.ts:497`, `modules/admin-ops/system-health.service.ts:162` | WORKS (code) | #843 automation |
| `ops.backup_max_age_hours` | `modules/admin-ops/system-health.service.ts:164`, `modules/admin-ops/system-health.service.ts:545` | WORKS (code) | #843 automation |
| `ops.cron_idle_after_runs` | `modules/admin-config/config-schema.ts:891`, `modules/admin-config/config-schema.ts:892` | WORKS (code) | #843 automation |
| `ops.cron_idle_backoff` | `modules/admin-config/config-schema.ts:888`, `common/ops/cron-idle-backoff.service.ts:58` | WORKS (code) | #843 automation |
| `ops.cron_idle_every_min` | `modules/admin-config/config-schema.ts:898`, `modules/admin-config/config-schema.ts:899` | WORKS (code) | #843 automation |
| `ops.db_slow_ms` | `modules/admin-ops/system-health.service.ts:163`, `modules/admin-ops/system-health.service.ts:356` | WORKS (code) | #843 automation |
| `ops.outbox_sweep.mode` | `sharding/outbox/cross-family-outbox.ts:42`, `common/ops/cost-registry.ts:2365` | WORKS (code) | #843 automation |
| `ops.reencrypt_rows_per_min` | `jobs/handlers/message-reencrypt.job.ts:17`, `jobs/handlers/message-reencrypt.job.ts:240` | WORKS (code) | #843 automation |
| `ops.route_metrics.mode` | `modules/admin-config/config-schema.ts:546`, `modules/admin-config/config-schema.ts:547` | WORKS (code) | #843 automation |
| `partition.auto_rows` | `partitioning/partition.service.ts:126`, `modules/admin-config/config-schema.ts:1317` | WORKS (code) | #843 automation |
| `partition.chat_group_messages_mode` | `partitioning/partition.service.ts:108` | WORKS (code) | #843 automation |
| `partition.messages_mode` | `partitioning/partition.service.ts:107` | WORKS (code) | #843 automation |
| `partition.notifications_mode` | `partitioning/partition.service.ts:109` | WORKS (code) | #843 automation |
| `partition.post_view_events_mode` | `partitioning/partition.service.ts:110`, `modules/admin-config/config-schema.ts:1311` | WORKS (code) | #843 automation |
| `payments.own_page_enabled` | `modules/admin-config/config-schema.ts:721`, `modules/admin-config/config-schema.ts:722` | WORKS (code) |  |
| `payments.own_page_ttl_minutes` | `modules/admin-config/config-schema.ts:726`, `modules/admin-config/config-schema.ts:727` | WORKS (code) |  |
| `post.max_chars_brief` | `modules/posts/posts.service.ts:204`, `modules/posts/posts.service.ts:227` | WORKS (code) |  |
| `post.max_chars_media` | `modules/posts/posts.service.ts:204`, `modules/posts/posts.service.ts:226` | WORKS (code) |  |
| `privacy.auto_retention` | `modules/privacy/privacy-retention.service.ts:36`, `modules/privacy/privacy-retention.service.ts:70` | WORKS (code) |  |
| `privacy.deletion_notices_per_day` | `modules/privacy/deletion-notices.service.ts:176` | WORKS (code) |  |
| `privacy.login_cancels_deletion` | `modules/privacy/deletion-notices.service.ts:40`, `modules/auth/auth.service.ts:622` | WORKS (code) |  |
| `privacy.retention_audit_log_days` | `modules/privacy/privacy-retention.service.ts:37`, `modules/privacy/privacy-retention.service.ts:85` | WORKS (code) |  |
| `privacy.retention_batch` | `modules/privacy/privacy-retention.service.ts:11`, `modules/privacy/privacy-retention.service.ts:56` | WORKS (code) |  |
| `privacy.retention_contact_disclosure_ip_days` | `modules/privacy/privacy-retention.service.ts:44`, `modules/privacy/privacy-retention.service.ts:88` | WORKS (code) |  |
| `privacy.retention_data_access_log_days` | `modules/privacy/privacy-retention.service.ts:39`, `modules/privacy/privacy-retention.service.ts:86` | WORKS (code) |  |
| `privacy.retention_max_rows` | `modules/privacy/privacy-retention.service.ts:13`, `modules/privacy/privacy-retention.service.ts:56` | WORKS (code) |  |
| `privacy.retention_session_ip_days` | `modules/privacy/privacy-retention.service.ts:41`, `modules/privacy/privacy-retention.service.ts:87` | WORKS (code) |  |
| `privacy.twilio_purge_enabled` | `modules/privacy/vendor-deletion.service.ts:59` | WORKS (code) |  |
| `privacy.twilio_purge_max_messages` | `modules/privacy/vendor-deletion.service.ts:65` | WORKS (code) |  |
| `profile.reserved_usernames` | `modules/usernames/username-policy.service.ts:160`, `modules/users/services/username-registry.service.ts:34` | WORKS (code) |  |
| `profile.username_brand_list` | `modules/usernames/username-policy.service.ts:161` | WORKS (code) |  |
| `profile.username_change_cooldown_days` | `modules/usernames/username-policy.service.ts:132`, `modules/profiles/services/client-profiles.service.ts:122` | WORKS (code) |  |
| `profile.username_hold_days` | `modules/usernames/username-policy.service.ts:193` | WORKS (code) |  |
| `profile.username_similar_min_audience` | `modules/usernames/username-policy.service.ts:227` | WORKS (code) |  |
| `push.chat_preview` | `modules/admin-config/config-schema.ts:662`, `modules/admin-config/config-schema.ts:663` | WORKS (code) |  |
| `qa.advice_flag_mode` | `modules/legal-qa/qa-safety.service.ts:86`, `modules/admin-config/config-schema.ts:1391` | WORKS (code) |  |
| `qa.alert_max_attorneys` | `modules/legal-qa/legal-qa.service.ts:655` | WORKS (code) |  |
| `qa.allow_anonymous` | `modules/legal-qa/legal-qa.service.ts:235` | WORKS (code) |  |
| `qa.answer_duplicate_max` | `modules/legal-qa/qa-safety.service.ts:179`, `modules/admin-config/config-schema.ts:1415` | WORKS (code) |  |
| `qa.banner_enabled` | `modules/legal-qa/legal-qa.service.ts:541` | WORKS (code) |  |
| `qa.banner_interval_hours` | `modules/legal-qa/legal-qa.service.ts:542` | WORKS (code) |  |
| `qa.banner_min_new` | `modules/legal-qa/legal-qa.service.ts:543` | WORKS (code) |  |
| `qa.duplicate_cross_user_max` | `modules/legal-qa/qa-safety.service.ts:160`, `modules/admin-config/config-schema.ts:1410` | WORKS (code) |  |
| `qa.duplicate_window_days` | `modules/legal-qa/qa-safety.service.ts:140`, `modules/admin-config/config-schema.ts:1405` | WORKS (code) |  |
| `qa.max_links` | `modules/legal-qa/qa-safety.service.ts:133`, `modules/admin-config/config-schema.ts:1404` | WORKS (code) |  |
| `qa.new_account_cooldown_hours` | `modules/legal-qa/qa-safety.service.ts:109`, `modules/admin-config/config-schema.ts:1399` | WORKS (code) |  |
| `qa.pii_kinds` | `modules/legal-qa/qa-safety.service.ts:203`, `modules/admin-config/config-schema.ts:1386` | WORKS (code) |  |
| `qa.pii_mode` | `modules/legal-qa/qa-safety.service.ts:201`, `modules/admin-config/config-schema.ts:1382` | WORKS (code) |  |
| `qa.profile_cta_enabled` | `modules/legal-qa/legal-qa.service.ts:544` | WORKS (code) |  |
| `qa.push_attorneys` | `modules/legal-qa/legal-qa.service.ts:654` | WORKS (code) |  |
| `queues.push_rate_mode` | `modules/admin-config/config-schema.ts:1156`, `modules/notifications/push/push-dispatcher.ts:170` | WORKS (code) | #843 automation |
| `queues.push_rate_per_sec` | `modules/admin-config/config-schema.ts:1163`, `modules/admin-config/config-schema.ts:1164` | WORKS (code) | #843 automation |
| `queues.scale_signal_mode` | `modules/admin-config/config-schema.ts:1156`, `jobs/handlers/ops-metrics.job.ts:172` | WORKS (code) | #843 automation |
| `ranking.events_mode` | `modules/experiments/ranking-events.service.ts:43`, `modules/experiments/ranking-events.service.ts:97` | DEAD (no producer, §5.6) |  |
| `ranking.events_retention_days` | `modules/experiments/experiments-nightly.job.ts:21`, `modules/experiments/experiments-nightly.job.ts:54` | WORKS (nothing to clean) |  |
| `ranking.impression_sample_percent` | `modules/experiments/ranking-events.service.ts:57`, `modules/experiments/ranking-events.service.ts:98` | DEAD (no producer, §5.6) |  |
| `rate_limit.answer_per_day` | `common/usage-limits/usage-limits.service.ts:115`, `modules/admin-config/config-schema.ts:1420` | WORKS (code) |  |
| `rate_limit.answer_per_hour` | `common/usage-limits/usage-limits.service.ts:112` | WORKS (code) |  |
| `rate_limit.bid_counter_per_hour` | `common/usage-limits/usage-limits.service.ts:119`, `modules/admin-config/config-schema.ts:420` | WORKS (code) |  |
| `rate_limit.bid_create_per_day` | `common/usage-limits/usage-limits.service.ts:118`, `modules/admin-config/config-schema.ts:419` | WORKS (code) |  |
| `rate_limit.case_create_per_day` | `common/usage-limits/usage-limits.service.ts:120`, `modules/admin-config/config-schema.ts:421` | WORKS (code) |  |
| `rate_limit.channel_comment_per_hour` | `common/usage-limits/usage-limits.service.ts:103` | WORKS (code) |  |
| `rate_limit.channel_create_per_day` | `common/usage-limits/usage-limits.service.ts:87` | WORKS (code) |  |
| `rate_limit.channel_post_per_hour` | `common/usage-limits/usage-limits.service.ts:99` | WORKS (code) |  |
| `rate_limit.chat_save_per_minute` | `common/usage-limits/usage-limits.service.ts:121`, `modules/admin-config/config-schema.ts:422` | WORKS (code) |  |
| `rate_limit.comment_per_hour` | `common/usage-limits/usage-limits.service.ts:57` | WORKS (code) |  |
| `rate_limit.consultation_book_per_day` | `common/usage-limits/usage-limits.service.ts:108` | WORKS (code) |  |
| `rate_limit.contacts_sync_per_hour` | `common/usage-limits/usage-limits.service.ts:71` | WORKS (code) |  |
| `rate_limit.follow_per_day` | `common/usage-limits/usage-limits.service.ts:60` | WORKS (code) |  |
| `rate_limit.forward_per_minute` | `common/usage-limits/usage-limits.service.ts:122`, `modules/admin-config/config-schema.ts:423` | WORKS (code) |  |
| `rate_limit.group_create_per_day` | `common/usage-limits/usage-limits.service.ts:91`, `modules/groups/groups.module.ts:24` | WORKS (code) |  |
| `rate_limit.like_per_hour` | `common/usage-limits/usage-limits.service.ts:59` | WORKS (code) |  |
| `rate_limit.message_per_minute` | `common/usage-limits/usage-limits.service.ts:61` | FIXED (#844) |  |
| `rate_limit.post_create_per_day` | `common/usage-limits/usage-limits.service.ts:56` | WORKS (code) |  |
| `rate_limit.post_create_per_hour` | `common/usage-limits/usage-limits.service.ts:95` | WORKS (code) |  |
| `rate_limit.question_per_day` | `common/usage-limits/usage-limits.service.ts:111` | WORKS (code) |  |
| `rate_limit.report_per_day` | `common/usage-limits/usage-limits.service.ts:74` | WORKS (code) |  |
| `rate_limit.search_per_minute` | `common/usage-limits/usage-limits.service.ts:62` | WORKS (code) |  |
| `rate_limit.search_suggest_per_minute` | `common/usage-limits/usage-limits.service.ts:67`, `modules/admin-config/config-schema.ts:424` | WORKS (code) |  |
| `rate_limit.sticker_add_per_hour` | `common/usage-limits/usage-limits.service.ts:84` | WORKS (code) |  |
| `rate_limit.sticker_pack_create_per_day` | `common/usage-limits/usage-limits.service.ts:81` | WORKS (code) |  |
| `rate_limit.story_create_per_day` | `common/usage-limits/usage-limits.service.ts:85` | WORKS (code) |  |
| `rate_limit.support_message_per_hour` | `modules/support/support.service.ts:229` | WORKS (code) |  |
| `rate_limit.support_ticket_per_hour` | `modules/support/support.service.ts:121` | WORKS (code) |  |
| `rate_limit.video_upload_per_day` | `common/usage-limits/usage-limits.service.ts:77` | WORKS (code) |  |
| `realtime.max_connects_per_ip_per_minute` | `modules/admin-config/config-schema.ts:428`, `modules/admin-config/config-schema.ts:429` | WORKS (code) |  |
| `realtime.max_connects_per_user_per_minute` | `modules/admin-config/config-schema.ts:435`, `modules/admin-config/config-schema.ts:436` | WORKS (code) |  |
| `realtime.max_sockets_per_user` | `modules/admin-config/config-schema.ts:459`, `modules/admin-config/config-schema.ts:460` | WORKS (code) |  |
| `reco.case.budget` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.case.client` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.case.competition` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.case.demand` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.case.fresh` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.case.practice` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.case.state` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.case.urgency` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.activity` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.affinity` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.contact` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.identity` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.mutual` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.popularity` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.practice` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.qa` | `modules/recommendations/recommendations.service.ts:166` | WORKS (code) |  |
| `reco.people.quality` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people.state` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.people_newest` | `modules/recommendations/recommendations.service.ts:449`, `modules/recommendations/recommendations.service.ts:451` | WORKS (code) |  |
| `reco.pin_paging_enabled` | `modules/recommendations/recommendations.service.ts:467`, `modules/recommendations/recommendations.service.ts:476` | WORKS (code) |  |
| `reco.post.affinity` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.post.fresh` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.post.hot` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.post.interest` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.post.language` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.post.social` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.post.state` | `modules/recommendations/recommendations.service.ts:180 (built name)` | WORKS (code) |  |
| `reco.qa.answers` | `modules/recommendations/qa-snapshot.service.ts:114` | WORKS (code) |  |
| `reco.qa.best` | `modules/recommendations/qa-snapshot.service.ts:116` | WORKS (code) |  |
| `reco.qa.gravity` | `modules/recommendations/qa-snapshot.service.ts:111` | WORKS (code) |  |
| `reco.qa.likes` | `modules/recommendations/qa-snapshot.service.ts:115` | WORKS (code) |  |
| `review.edit_window_days` | `modules/reviews/reviews.service.ts:167`, `modules/reviews/reviews.service.ts:287` | WORKS (code) |  |
| `review.reminder_after_days` | `jobs/handlers/review-reminder.job.ts:68` | WORKS (code) |  |
| `reviews.auto_remove_undecided_appeals` | `modules/client-reviews/client-reviews.service.ts:604` | WORKS (code) |  |
| `rewards.auto_award` | `modules/rewards/rewards.service.ts:86`, `modules/rewards/rewards.service.ts:120` | WORKS (code) |  |
| `rewards.enabled` | `modules/rewards/rewards.service.ts:85`, `modules/rewards/rewards.service.ts:119` | WORKS (code) |  |
| `rewards.period` | `modules/rewards/rewards.service.ts:121`, `modules/rewards/rewards.service.ts:402` | WORKS (code) |  |
| `scale.bunny_hardstop.mode` | `common/ops/cost-registry.ts:1805`, `modules/admin-config/config-schema.ts:1033` | WORKS (code) | #843 automation |
| `scale.capacity_ceiling.mode` | `common/ops/cost-registry.ts:500`, `modules/admin-config/config-schema.ts:1026` | WORKS (code) | #843 automation |
| `scale.cloudflare_hardstop.mode` | `common/ops/cost-registry.ts:1837`, `modules/calls/sfu-broker.service.ts:209` | WORKS (code) | #843 automation |
| `scale.db_split_enabled` | `modules/admin-ops/scale.service.ts:60`, `modules/admin-config/config-schema.ts:862` | WORKS (code) | #843 automation |
| `scale.endpoints.ceiling` | `common/ops/cost-registry.ts:343`, `modules/admin-config/config-schema.ts:275` | WORKS (code) | #843 automation |
| `scale.endpoints.mode` | `common/ops/cost-registry.ts:332`, `common/ops/cost-registry.ts:337` | WORKS (code) | #843 automation |
| `search.engine` | `cli/search-reindex.ts:21`, `modules/admin-ops/scale.service.ts:37` | NOT CONFIGURED (OPENSEARCH_URL empty; Postgres search works) |  |
| `search.engine_kind` | `modules/admin-config/config-schema.ts:87`, `modules/admin-config/admin-config.service.ts:264` | NOT CONFIGURED |  |
| `search.engine_timeout_ms` | `modules/admin-config/config-schema.ts:94`, `modules/search/search-switch.provider.ts:156` | inert (engine off) |  |
| `search.learn_min_users` | `modules/search/search-log.service.ts:159` | WORKS (code) |  |
| `search.ranked_cache_ttl_sec` | `modules/admin-config/config-schema.ts:923`, `modules/admin-config/config-schema.ts:924` | WORKS (code) |  |
| `search.reindex_keep_days` | `modules/admin-config/config-schema.ts:102`, `modules/search/search-reindex.service.ts:112` | inert (engine off) |  |
| `search.reindex_throttle_ms` | `modules/admin-config/config-schema.ts:140`, `modules/search/search-reindex.service.ts:115` | inert (engine off) |  |
| `search.weight_priority` | `modules/search/postgres-search.provider.ts:273` | WORKS (code) |  |
| `search.weight_rating` | `modules/search/postgres-search.provider.ts:275` | WORKS (code) |  |
| `search.weight_text` | `modules/search/engine/opensearch-search.provider.ts:59`, `modules/search/postgres-search.provider.ts:271` | WORKS (code) |  |
| `search.weight_title` | `common/search/fts-sql.ts:32`, `modules/search/engine/opensearch-search.provider.ts:58` | WORKS (code) |  |
| `search.weight_verified` | `modules/search/postgres-search.provider.ts:274` | WORKS (code) |  |
| `security.admin_rate_limit_per_minute` | `throttler/throttle-limits.ts:5`, `throttler/user-throttler.guard.ts:35` | WORKS (code) |  |
| `security.anonymous_rate_limit_per_minute` | `throttler/user-throttler.guard.ts:129`, `modules/admin-config/config-schema.ts:466` | WORKS (code) |  |
| `security.app_check.mode` | `common/ops/cost-registry.ts:2172`, `modules/admin-config/config-schema.ts:484` | WORKS as monitor (app sends no token, §5.3) |  |
| `security.app_check.replay_protection` | `modules/admin-config/config-schema.ts:496`, `modules/admin-config/config-schema.ts:497` | inert (mode monitor) |  |
| `security.attorney_strong_auth` | `modules/admin-config/config-schema.ts:569`, `modules/admin-config/config-schema.ts:570` | FIXED (#844) |  |
| `security.auth_challenge_after_failures` | `modules/admin-config/config-schema.ts:501`, `modules/admin-config/config-schema.ts:502` | WORKS (code) |  |
| `security.new_country_alert_enabled` | `modules/admin-config/config-schema.ts:518`, `modules/admin-config/config-schema.ts:519` | WORKS (code) |  |
| `security.otp_legacy_purpose_fallback` | `modules/admin-config/config-schema.ts:508`, `modules/admin-config/config-schema.ts:509` | WORKS (code) |  |
| `security.otp_per_identifier_per_day` | `config/env.schema.ts:217`, `modules/admin-config/config-schema.ts:476` | WORKS (code) |  |
| `security.password_breach_check_enabled` | `modules/auth/services/password.service.ts:142`, `modules/auth/services/password.service.ts:180` | WORKS (code) |  |
| `security.password_breach_timeout_ms` | `modules/admin-config/config-schema.ts:454`, `modules/admin-config/config-schema.ts:455` | WORKS (code) |  |
| `security.password_common_list_enabled` | `modules/auth/services/password.service.ts:143`, `modules/auth/services/password.service.ts:173` | WORKS (code) |  |
| `security.password_hash_concurrency` | `modules/admin-config/config-schema.ts:442`, `modules/admin-config/config-schema.ts:443` | WORKS (code) |  |
| `security.password_hash_max_queue` | `modules/admin-config/config-schema.ts:449`, `modules/admin-config/config-schema.ts:450` | WORKS (code) |  |
| `security.seal_case_metadata` | `common/secrets/message-body-cipher.ts:133`, `common/secrets/message-body-cipher.ts:138` | WORKS (code) |  |
| `security.seal_journal_text` | `common/secrets/message-body-cipher.ts:145`, `common/secrets/message-body-cipher.ts:149` | WORKS (code) |  |
| `security.signup_block_disposable_email` | `modules/admin-config/config-schema.ts:513`, `modules/admin-config/config-schema.ts:514` | inert (email_login off) |  |
| `security.turnstile.mode` | `common/ops/cost-registry.ts:2198`, `modules/feature-flags/services/bootstrap.service.ts:227` | NOT CONFIGURED (no site key in bootstrap) |  |
| `seo.checklist.app_store_connect` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.apple_business_connect` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.bing_webmaster` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.google_business_profile` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.google_search_console` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.lawyer_directories` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.play_console` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.pr_reviews` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.reddit_quora` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.video_social` | — | by design (owner check-list mark, not a switch) |  |
| `seo.checklist.yelp_bbb` | — | by design (owner check-list mark, not a switch) |  |
| `seo.generator_debounce_seconds` | `common/seo/seo-generator.trigger.ts:47`, `common/seo/seo-generator.trigger.ts:105` | WORKS (code) |  |
| `seo.generator_max_attorneys` | `modules/admin-config/config-schema.ts:1109`, `modules/admin-config/config-schema.ts:1110` | WORKS (code) |  |
| `seo.generator_max_uploads_per_run` | `modules/admin-config/config-schema.ts:1114`, `modules/admin-config/config-schema.ts:1115` | WORKS (code) |  |
| `seo.generator_min_interval_minutes` | `common/seo/seo-generator.trigger.ts:48`, `common/seo/seo-generator.trigger.ts:108` | WORKS (code) |  |
| `seo.generator_mode` | `config/env.schema.ts:469`, `common/seo/seo-generator.trigger.ts:17` | WORKS (code) |  |
| `seo.incremental_enabled` | `modules/admin-config/config-schema.ts:976`, `modules/admin-promotion/promotion.catalog.ts:12` | WORKS (code) |  |
| `seo.llms_enabled` | `modules/admin-config/config-schema.ts:978`, `modules/admin-promotion/promotion.catalog.ts:15` | WORKS (code) |  |
| `seo.max_invalidation_paths_per_day` | `modules/admin-config/config-schema.ts:1119`, `modules/admin-config/config-schema.ts:1120` | WORKS (code) |  |
| `seo.pages_cities_enabled` | `modules/admin-config/config-schema.ts:980`, `modules/admin-promotion/promotion.catalog.ts:18` | WORKS (code) |  |
| `seo.pages_posts_enabled` | `modules/admin-config/config-schema.ts:982`, `modules/admin-promotion/promotion.catalog.ts:19` | WORKS (code) |  |
| `seo.pages_qa_enabled` | `modules/admin-config/config-schema.ts:984`, `modules/admin-promotion/promotion.catalog.ts:20` | WORKS (code) |  |
| `seo.quality_gate_enabled` | `modules/admin-config/config-schema.ts:986`, `modules/admin-promotion/promotion.catalog.ts:16` | WORKS (code) |  |
| `seo.ramp_per_day` | `modules/admin-config/config-schema.ts:988`, `modules/admin-config/config-schema.ts:1012` | WORKS (code) |  |
| `seo.robots_ai_enabled` | `modules/admin-config/config-schema.ts:990`, `modules/admin-promotion/promotion.catalog.ts:14` | WORKS (code) |  |
| `seo.sitemap_index_enabled` | `modules/admin-config/config-schema.ts:992`, `modules/admin-promotion/promotion.catalog.ts:13` | WORKS (code) |  |
| `sms.burst_ceiling_multiplier` | `common/cost-guard/sms-abuse-guard.service.ts:49`, `common/cost-guard/sms-abuse-guard.service.ts:104` | WORKS (code) |  |
| `sms.burst_multiplier` | `common/cost-guard/sms-abuse-guard.service.ts:47`, `common/cost-guard/sms-abuse-guard.service.ts:103` | WORKS (code) |  |
| `sms.cap_mode` | `common/cost-guard/sms-abuse-guard.service.ts:46`, `common/cost-guard/sms-abuse-guard.service.ts:102` | WORKS (code) |  |
| `sms.country_velocity_max` | `common/cost-guard/sms-abuse-guard.service.ts:32`, `common/cost-guard/sms-abuse-guard.service.ts:157` | WORKS (code) |  |
| `sms.prefix_block_minutes` | `common/cost-guard/sms-abuse-guard.service.ts:33`, `common/cost-guard/sms-abuse-guard.service.ts:159` | WORKS (code) |  |
| `sms.prefix_velocity_max` | `common/cost-guard/sms-abuse-guard.service.ts:29`, `common/cost-guard/sms-abuse-guard.service.ts:156` | WORKS (code) |  |
| `sms.prefix_velocity_window_minutes` | `common/cost-guard/sms-abuse-guard.service.ts:30`, `common/cost-guard/sms-abuse-guard.service.ts:158` | WORKS (code) |  |
| `sms.registration_per_number_per_day` | `modules/admin-config/config-schema.ts:740`, `modules/admin-config/config-schema.ts:741` | WORKS (code) |  |
| `sms.resend_cooldown_seconds` | `modules/admin-config/config-schema.ts:733`, `modules/admin-config/config-schema.ts:734` | WORKS (code) |  |
| `sms.reset_per_number_per_day` | `modules/admin-config/config-schema.ts:752`, `modules/admin-config/config-schema.ts:753` | WORKS (code) |  |
| `sms.reset_per_number_per_hour` | `modules/admin-config/config-schema.ts:746`, `modules/admin-config/config-schema.ts:747` | WORKS (code) |  |
| `sms.signup_daily_cap` | `common/cost-guard/sms-abuse-guard.service.ts:41`, `common/cost-guard/sms-abuse-guard.service.ts:272` | WORKS (code) |  |
| `stickers.max_installed` | `modules/stickers/stickers.service.ts:495` | WORKS (code) |  |
| `stickers.max_own_packs` | `modules/stickers/stickers.service.ts:161` | WORKS (code) |  |
| `stickers.max_per_pack` | `modules/stickers/stickers.service.ts:220`, `modules/admin-media/admin-stickers.service.ts:258` | WORKS (code) |  |
| `stickers.recent_max` | `modules/stickers/stickers.service.ts:61` | WORKS (code) |  |
| `stickers.scan_uploads` | `modules/stickers/stickers.service.ts:440` | WORKS (code) |  |
| `storage.auto_cleanup` | `modules/storage/admin-storage.controller.ts:117`, `modules/storage/admin-storage.controller.ts:245` | WORKS (code) | #841 media |
| `storage.auto_retention` | `modules/storage/admin-storage.controller.ts:125`, `modules/storage/admin-storage.controller.ts:253` | WORKS (code) | #841 media |
| `storage.chat_quota_mb` | `modules/files/files.service.ts:1551`, `modules/storage/admin-storage.controller.ts:123` | WORKS (code) | #841 media |
| `storage.daily_upload_mb_per_user` | `modules/admin-config/config-schema.ts:815`, `modules/admin-config/config-schema.ts:816` | WORKS (code) | #841 media |
| `storage.dedup` | `modules/files/jobs/file-scan.processor.ts:234`, `modules/files/jobs/file-scan.processor.ts:240` | WORKS (code) | #841 media |
| `storage.deleted_posts_media_days` | `modules/storage/admin-storage.controller.ts:120`, `modules/storage/admin-storage.controller.ts:248` | WORKS (code) | #841 media |
| `storage.growth_alert_percent` | `modules/storage/admin-storage.controller.ts:130`, `modules/storage/admin-storage.controller.ts:257` | WORKS (code) | #841 media |
| `storage.image_format` | `modules/files/jobs/file-scan.processor.ts:289`, `modules/files/processing/avatar-backfill.ts:106` | WORKS (code) | #841 media |
| `storage.orphan_grace_hours` | `modules/storage/admin-storage.controller.ts:118`, `modules/storage/admin-storage.controller.ts:246` | WORKS (code) | #841 media |
| `storage.purge_after_days` | `modules/storage/admin-storage.controller.ts:119`, `modules/storage/admin-storage.controller.ts:247` | WORKS (code) | #841 media |
| `storage.retention_app_events_days` | `modules/storage/data-retention.service.ts:97` | WORKS (code) | #841 media |
| `storage.retention_assistant_activity_days` | `modules/storage/admin-storage.controller.ts:127`, `modules/storage/admin-storage.controller.ts:255` | WORKS (code) | #841 media |
| `storage.retention_auth_events_days` | `modules/privacy/privacy-retention.service.ts:47`, `modules/storage/admin-storage.controller.ts:126` | WORKS (code) | #841 media |
| `storage.retention_channel_post_views_days` | `modules/storage/data-retention.service.ts:96` | WORKS (code) | #841 media |
| `storage.retention_inbox_days` | `modules/storage/data-retention.service.ts:54`, `modules/storage/data-retention.service.ts:101` | WORKS (code) | #841 media |
| `storage.retention_outbox_done_days` | `modules/storage/data-retention.service.ts:53`, `modules/storage/data-retention.service.ts:100` | WORKS (code) | #841 media |
| `storage.retention_post_view_events_days` | `modules/storage/data-retention.service.ts:46`, `modules/storage/data-retention.service.ts:98` | WORKS (code) | #841 media |
| `storage.retention_post_views_days` | `modules/storage/data-retention.service.ts:43`, `modules/storage/data-retention.service.ts:95` | WORKS (code) | #841 media |
| `storage.retention_snapshots_days` | `modules/storage/data-retention.service.ts:42`, `modules/storage/data-retention.service.ts:94` | WORKS (code) | #841 media |
| `storage.retention_user_activity_days` | `modules/storage/data-retention.service.ts:49`, `modules/storage/data-retention.service.ts:99` | WORKS (code) | #841 media |
| `storage.user_quota_mb` | `modules/files/files.service.ts:1529`, `modules/storage/admin-storage.controller.ts:122` | WORKS (code) | #841 media |
| `stories.max_active_per_user` | `modules/stories/stories.service.ts:360` | WORKS (code) |  |
| `stories.max_video_sec` | `modules/feature-flags/services/bootstrap.service.ts:162`, `modules/stories/stories.service.ts:310` | FIXED (#844, app side) |  |
| `stories.ttl_hours` | `modules/stories/stories.service.ts:370` | WORKS (code) |  |
| `stripe_ops.dispute_auto_draft` | `modules/stripe-ops/dispute.service.ts:99` | WORKS (code) |  |
| `stripe_ops.dispute_rate_alarm_percent` | `modules/stripe-ops/dispute.service.ts:521` | WORKS (code) |  |
| `stripe_ops.dispute_rate_min_count` | `modules/stripe-ops/dispute.service.ts:522` | WORKS (code) |  |
| `stripe_ops.dispute_rate_warn_percent` | `modules/stripe-ops/dispute.service.ts:520` | WORKS (code) |  |
| `stripe_ops.dispute_reminder_days` | `modules/stripe-ops/dispute.service.ts:442` | WORKS (code) |  |
| `stripe_ops.efw_auto_refund_max_cents` | `modules/case-payments/case-payments.service.ts:1586` | WORKS (code) |  |
| `stripe_ops.hold_payouts_on_dispute` | `modules/stripe-ops/dispute.service.ts:44`, `modules/stripe-ops/dispute.service.ts:373` | WORKS (code) |  |
| `stripe_ops.notify_staff` | `modules/stripe-ops/stripe-review.service.ts:228` | WORKS (code) |  |
| `stripe_ops.review_sla_hours` | `modules/stripe-ops/stripe-review.service.ts:69` | WORKS (code) |  |
| `stripe_ops.sweep_lookback_days` | `jobs/handlers/stripe-ops.job.ts:36` | WORKS (code) |  |
| `subscription.past_due_grace_days` | `modules/billing/subscription-sync.service.ts:250`, `modules/billing/subscription-sync.service.ts:541` | WORKS (code) |  |
| `support.always_open` | `modules/support/support-desk.service.ts:57`, `modules/support/support-desk.service.ts:108` | WORKS (code) |  |
| `support.auto_assign` | `modules/support/support-desk.service.ts:70`, `modules/support/support-desk.service.ts:103` | WORKS (code) |  |
| `support.auto_close_resolved_days` | `modules/support/support-desk.service.ts:76`, `modules/support/support-desk.service.ts:116` | WORKS (code) |  |
| `support.auto_reply` | `modules/support/support-desk.service.ts:75`, `modules/support/support-desk.service.ts:115` | WORKS (code) |  |
| `support.escalate_on_breach` | `modules/support/support-desk.service.ts:74`, `modules/support/support-desk.service.ts:107` | WORKS (code) |  |
| `support.open_days` | `modules/admin-config/config-schema.ts:1262`, `modules/admin-config/config-schema.ts:1263` | WORKS (code) |  |
| `support.open_from_hour` | `modules/admin-config/config-schema.ts:1268`, `modules/admin-config/config-schema.ts:1269` | WORKS (code) |  |
| `support.open_to_hour` | `modules/admin-config/config-schema.ts:1273`, `modules/admin-config/config-schema.ts:1274` | WORKS (code) |  |
| `support.sla_alerts` | `modules/support/support-desk.service.ts:73`, `modules/support/support-desk.service.ts:106` | WORKS (code) |  |
| `support.sla_first_response_minutes` | `modules/support/support-desk.service.ts:71`, `modules/support/support-desk.service.ts:104` | WORKS (code) |  |
| `support.sla_urgent_minutes` | `modules/support/support-desk.service.ts:72`, `modules/support/support-desk.service.ts:105` | WORKS (code) |  |
| `support.timezone` | `modules/admin-config/config-schema.ts:1278`, `modules/admin-config/config-schema.ts:1279` | WORKS (code) |  |
| `tasks.archive_auto_purge` | `modules/assistants/tasks.service.ts:1338`, `jobs/handlers/tasks-planner.jobs.ts:183` | WORKS (code) |  |
| `tasks.archive_retention_days` | `modules/assistants/tasks.service.ts:1339`, `jobs/handlers/tasks-planner.jobs.ts:180` | WORKS (code) |  |
| `today.sentry_enabled` | `modules/admin-config/config-schema.ts:856`, `modules/staff-home/sentry-issues.client.ts:63` | NOT CONFIGURED (no Sentry DSN in prod bootstrap) |  |
| `translate.cases` | `modules/translation/translation-zones.ts:23 (built name)` | WORKS (code) |  |
| `translate.chat` | `modules/translation/translation-zones.ts:23 (built name)` | WORKS (code) |  |
| `translate.posts` | `modules/translation/translation-zones.ts:23 (built name)` | WORKS (code) |  |
| `translate.profiles` | `modules/translation/translation-zones.ts:23 (built name)` | WORKS (code) |  |
| `translate.reviews` | `modules/translation/translation-zones.ts:23 (built name)` | WORKS (code) |  |
| `translate.scope` | `modules/translation/translation-zones.ts:6`, `modules/translation/translation-zones.ts:12` | WORKS (code) |  |
| `treasury.auto` | `modules/treasury/treasury.service.ts:163`, `modules/treasury/treasury.service.ts:519` | WORKS (code) |  |
| `treasury.buffer_percent` | `modules/treasury/treasury.service.ts:521`, `modules/treasury/admin-treasury.controller.ts:117` | WORKS (code) |  |
| `treasury.min_profit_usd` | `modules/treasury/treasury.service.ts:523`, `modules/treasury/admin-treasury.controller.ts:119` | WORKS (code) |  |
| `treasury.payout_day` | `modules/treasury/treasury.service.ts:70`, `modules/treasury/treasury.service.ts:164` | WORKS (code) |  |
| `treasury.payroll_auto` | `modules/treasury/treasury.service.ts:216`, `modules/treasury/treasury.service.ts:231` | WORKS (code) |  |
| `treasury.payroll_day` | `modules/treasury/treasury.service.ts:217`, `modules/treasury/treasury.service.ts:232` | WORKS (code) |  |
| `treasury.payroll_retry_failed_enabled` | `modules/treasury/treasury.service.ts:307` | WORKS (code) |  |
| `treasury.payroll_stuck_minutes` | `modules/treasury/treasury.service.ts:176`, `modules/treasury/treasury.service.ts:185` | WORKS (code) |  |
| `treasury.payroll_stuck_sweep_enabled` | `modules/treasury/treasury.service.ts:178`, `modules/treasury/treasury.service.ts:184` | WORKS (code) |  |
| `treasury.payroll_warn_days` | `modules/treasury/treasury.service.ts:220`, `modules/treasury/treasury.service.ts:233` | WORKS (code) |  |
| `treasury.refund_buffer_usd` | `modules/treasury/treasury.service.ts:522`, `modules/treasury/admin-treasury.controller.ts:118` | WORKS (code) |  |
| `trust.auto_hold_on_complaint` | `modules/attorney-trust/admin-trust.service.ts:64`, `modules/attorney-trust/attorney-trust.service.ts:899` | WORKS (code) |  |
| `trust.auto_hold_on_name_mismatch` | `modules/attorney-trust/admin-trust.service.ts:67`, `modules/attorney-trust/attorney-trust.service.ts:605` | WORKS (code) |  |
| `trust.bids_require_cleared` | `modules/bids/bids.service.ts:241`, `modules/attorney-trust/admin-trust.service.ts:62` | WORKS (code) |  |
| `trust.block_contacts` | `modules/attorney-trust/admin-trust.service.ts:72`, `modules/attorney-trust/bar-number-blocks.service.ts:65` | WORKS (code) |  |
| `trust.block_on_reject` | `modules/verification/services/verification-admin.service.ts:707`, `modules/verification/services/verification-admin.service.ts:1187` | WORKS (code) |  |
| `trust.complaint_window_days` | `modules/admin-config/config-schema.ts:1185`, `modules/admin-config/config-schema.ts:1186` | WORKS (code) |  |
| `trust.complaints_to_suspend` | `modules/admin-config/config-schema.ts:1180`, `modules/admin-config/config-schema.ts:1181` | WORKS (code) |  |
| `trust.enabled` | `modules/attorney-trust/admin-trust.service.ts:57`, `modules/attorney-trust/bar-number-blocks.service.ts:53` | WORKS (code) |  |
| `trust.firm_link_auto_email` | `modules/attorney-trust/admin-trust.service.ts:70`, `modules/attorney-trust/attorney-trust.service.ts:749` | WORKS (code) |  |
| `trust.firm_link_auto_registry` | `modules/attorney-trust/admin-trust.service.ts:69`, `modules/attorney-trust/attorney-trust.service.ts:821` | WORKS (code) |  |
| `trust.flag_duplicate_claims` | `modules/attorney-trust/admin-trust.service.ts:68`, `modules/attorney-trust/attorney-trust.service.ts:991` | WORKS (code) |  |
| `trust.manual_review` | `modules/attorney-trust/admin-trust.service.ts:58`, `modules/attorney-trust/attorney-trust.service.ts:1116` | WORKS (code) |  |
| `trust.payout_delay_days` | `modules/admin-config/config-schema.ts:1173`, `modules/admin-config/config-schema.ts:1174` | WORKS (code) |  |
| `trust.require_documents` | `modules/attorney-trust/admin-trust.service.ts:61`, `modules/attorney-trust/attorney-trust.service.ts:1119` | WORKS (code) |  |
| `trust.require_identity` | `modules/attorney-trust/admin-trust.service.ts:60`, `modules/attorney-trust/attorney-trust.service.ts:1118` | WORKS (code) |  |
| `trust.require_registry` | `modules/attorney-trust/admin-trust.service.ts:59`, `modules/attorney-trust/attorney-trust.service.ts:1117` | WORKS (code) |  |
| `usage.bunny_bandwidth_crit_gb` | `modules/admin-config/config-schema.ts:1054`, `modules/admin-config/config-schema.ts:1055` | WORKS (code) | #843 automation |
| `usage.bunny_bandwidth_warn_gb` | `modules/admin-config/config-schema.ts:944`, `modules/admin-config/config-schema.ts:945` | WORKS (code) | #843 automation |
| `usage.bunny_storage_crit_gb` | `modules/admin-config/config-schema.ts:1067`, `modules/admin-config/config-schema.ts:1068` | WORKS (code) | #843 automation |
| `usage.bunny_storage_warn_gb` | `modules/admin-config/config-schema.ts:1061`, `modules/admin-config/config-schema.ts:1062` | WORKS (code) | #843 automation |
| `usage.cloudflare_egress_crit_gb` | `common/ops/cost-registry.ts:1843`, `modules/admin-config/config-schema.ts:937` | WORKS (code) | #843 automation |
| `usage.cloudflare_egress_warn_gb` | `modules/admin-config/config-schema.ts:930`, `modules/admin-config/config-schema.ts:931` | WORKS (code) | #843 automation |
| `verification.bar_cooldown_hours` | `modules/verification/services/bar-attempts.service.ts:45` | WORKS (code) |  |
| `verification.bar_document_for_manual_states` | `modules/admin-config/config-schema.ts:667`, `modules/admin-config/config-schema.ts:668` | WORKS (code) |  |
| `verification.bar_fail_reset_days` | `modules/verification/services/bar-attempts.service.ts:52` | WORKS (code) |  |
| `verification.bar_fails_per_step` | `modules/verification/services/bar-attempts.service.ts:42` | WORKS (code) |  |
| `verification.bar_formats` | `modules/verification/services/verification-requests.service.ts:321`, `modules/verification/bar-number-format.ts:8` | WORKS (code) |  |
| `verification.client_badge_auto_approve` | `modules/client-badge/client-badge.service.ts:127` | WORKS (code) |  |
| `verification.client_badge_cents` | `modules/client-badge/client-badge.service.ts:424`, `modules/billing/pricing.service.ts:228` | WORKS (code) |  |
| `verification.license_expiry_grace_days` | `jobs/handlers/license-expiry.job.ts:98`, `modules/verification/services/verification-admin.service.ts:171` | WORKS (code) |  |
| `verification.license_expiry_notify_days` | `jobs/handlers/license-expiry.job.ts:40`, `jobs/handlers/license-expiry.job.ts:61` | WORKS (code) |  |
| `verification.max_submissions_30d` | `modules/verification/services/verification-requests.service.ts:210`, `modules/verification/services/verification-requests.service.ts:241` | WORKS (code) |  |
| `verification.require_bar_document` | `modules/verification/services/verification-requests.service.ts:189` | WORKS (code) |  |
| `verification.require_identity` | `modules/verification/services/verification-requests.service.ts:123`, `modules/verification/services/verification-requests.service.ts:136` | WORKS (code) |  |
| `verification.require_photo` | `modules/verification/services/verification-requests.service.ts:175`, `modules/verification/services/verification-requests.service.ts:177` | WORKS (code) |  |
| `verification.self_attestation_auto_approve` | `modules/verification/services/verification-requests.service.ts:806`, `apps/mobile/lib/features/onboarding/domain/attorney_setup.dart:51` | WORKS (code) |  |
| `verification.selfie_live_capture_required` | `modules/verification/services/verification-requests.service.ts:572`, `modules/verification/services/selfie-capture-tokens.service.ts:60` | WORKS (code) |  |
| `verification.signed_url_ttl_sec` | `modules/files/files.service.ts:856`, `modules/files/files.service.ts:875` | WORKS (code) |  |
| `video.max_duration_sec` | `modules/videos/videos.service.ts:509`, `modules/videos/videos.service.ts:514` | partly DEAD (legacy, overridden by video.reel_max_duration_sec) |  |
| `video.max_pending_per_user` | `modules/videos/videos.service.ts:237` | WORKS (code) |  |
| `video.max_size_mb` | `modules/videos/videos.service.ts:174`, `modules/videos/videos.service.ts:412` | WORKS (code) |  |
| `video.max_source_duration_sec` | `modules/videos/videos.service.ts:527`, `modules/videos/videos.service.ts:531` | WORKS (code) |  |
| `video.playback_ttl_sec` | `modules/videos/videos.service.ts:478` | WORKS (code) |  |
| `video.post_max_duration_sec` | `modules/videos/videos.service.ts:519`, `modules/videos/videos.service.ts:523` | WORKS (code) |  |
| `video.reel_max_duration_sec` | `modules/videos/videos.service.ts:508`, `modules/videos/videos.service.ts:513` | WORKS (code) |  |
| `video.upload_ttl_min` | `modules/videos/videos.service.ts:255` | WORKS (code) |  |
| `web.allowed_origins` | `common/cors/cors-policy.ts:6`, `common/cors/cors-policy.ts:25` | WORKS (code) |  |

