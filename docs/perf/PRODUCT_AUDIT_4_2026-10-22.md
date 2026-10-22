# Product, UX and compliance audit #4 (2026-10-22)

Read-only. Not repeated here: items from audits #1–#3 and everything fixed on branches since (calls, chats UI, push avatars, admin TOTP and step-up, iOS web payments, Sentry native, text scale 1.3×, permission card, contacts delta sync, RDS, CSP and the rest). origin/main was checked on 2026-10-22: none of the findings below is fixed. Paths are relative to `apps/`.

**Already good:** consents are append-only (`api/prisma/schema.prisma:1124-1145`). Deletion has a 14-day grace period and data export exists (`api/src/modules/privacy/*`). The text outbox is saved in Drift and drains on reconnect (`mobile/lib/features/chat/application/chat_providers.dart:235-330`). Plural rules and RTL are handled (`core/l10n/plural_rules.dart`, `app.dart:46-83`). Cost caps autoscale. Admin has support macros, SLA filters and refunds. The case-payment fee is designed around ABA Rule 5.4.

## 1. Role parity

- **Saved is in a different place for each role (M, S).** Attorneys get a bookmark in Mine (`mobile/lib/features/cases/presentation/screens/mine_views.dart:246-254`). Clients get a row in Settings (`features/profile/presentation/screens/settings_screen.dart:263-269`). Fix: the same place for both roles.
- **Payments are split up (M, S).** Clients see "Payments" and also "Case payments history" (`settings_screen.dart:109-116,160-172`). Attorneys find their receipts only under Subscription (`:102-107`). Stripe and Slack use one Billing page ([Stripe](https://docs.stripe.com/customer-management)). Fix: one "Payments" page with tabs.
- **One icon means two things (L, S).** `verifiedUserOutlined` is used for both Trust and Client badge (`settings_screen.dart:122,181`). `giftOutlined` is used for both Bid packs and Referrals (`:191,244`).
- **Root cause: three profile implementations (M, L).** `attorney_profile_view.dart` (1 614 lines), `client_profile_view.dart` (374) and `client_social_profile.dart` (720), plus two edit screens (707 and 441). Fix: one profile shell with role sections.

## 2. Onboarding and empty states

- **No guest browsing (H, M).** With no token, every route goes to `/welcome` (`core/navigation/guards/app_router_guard.dart:100-109`). Thumbtack and Avvo let people browse lawyers before signing up; early forced sign-up loses users ([Baymard](https://baymard.com/blog/delays-account-creation)). Fix: read-only feed, search and profiles for guests; ask for an account only when they act.
- **Password required after the OTP (M, S).** `app_router_guard.dart:127-129` adds a step that WhatsApp and Telegram do not have. Fix: make the password optional.

## 3. Offline and resilience

- **Media sends live only in memory (H, M).** Voice, photo, file and sticker messages go to `voiceOutbox` state (`chat_providers.dart:508,763`). Only text goes to Drift (`features/social/data/social_local_database.dart:20-40`). If the app is killed, the message is lost. Reels upload through an in-memory job (`features/reels/application/reel_publish_job.dart:17-19`). WhatsApp and Instagram keep a persistent media queue. The standard tools are iOS background URLSession and Android WorkManager ([Apple](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background), [Android](https://developer.android.com/develop/background-work/background-tasks/persistent)). Fix: a persistent upload queue with resume.
- **The upload code is copied seven times (M, M).** The same "Upload to storage failed" path appears in stickers, chat (twice), social, verification, avatar, team and support (`features/*/data/*_repository.dart`). Fix: one shared uploader with retry.

## 4. i18n, RTL and time zones

- **Server texts exist only in Russian and English (H, S).** Call pushes (`api/src/modules/notifications/push/push-dispatcher.ts:243-249,292,559,759`) and the template fallbacks (`notification-template.service.ts:29,71,103,139`) cover two languages. Support hours cover three (`support/support-hours.ts:110-119`). The app supports 85 languages. Fix: use `notif.*` i18n keys everywhere.
- **Legal documents exist only in en and ru, and `disclaimer` only in en (M, M)** (`api/assets/legal/`). Every user must accept them.
- **43 left/right-only layouts (L, S)** such as `EdgeInsets.only(left:)` and `Alignment.centerLeft`. Examples: `conversation_screen.dart:508,1724`, `client_review_sheet.dart:252,337,381`. Fix: directional versions.

## 5. Compliance and legal

- **Deletion leaves media public (H, M).** `account-anonymization.service.ts:180-198` releases only avatar, verification, voice and chat files. Posts are only marked removed (`:371-372`). Never deleted: `post_image`, `post_video` (Bunny; `videos.markDeleted` is not called), `case_photo`, `case_attachment`, `review_photo`, `post_attachment`, `support_attachment`, and story files (stories are hidden now, but the rows and files remain). The Stripe Customer is not deleted either (`:160-176` only cancels the subscription). This conflicts with GDPR Art. 17 ([gdpr-info](https://gdpr-info.eu/art-17-gdpr/), [Stripe delete](https://docs.stripe.com/api/customers/delete)). Fix: release every file purpose, purge Bunny and stories, delete the Stripe Customer.
- **No image or video moderation (H, M).** Moderation checks text only, with rules (`moderation/rule-based-moderation.hook.ts:36-40`). Public photos and reels are never scanned. Apple 1.2 requires UGC filtering ([Apple](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)). Instagram uses PhotoDNA hash matching, and US law (18 U.S.C. §2258A) requires reporting CSAM. Fix: AWS Rekognition moderation plus PhotoDNA, and an NCMEC report path.
- **The analytics consent is ignored (M, S).** Onboarding asks for `analytics` (`schema.prisma:89`), but `AppEvents.optedOut` is set only on the web (`core/platform/web_consent_notice.dart:15,55`). On the web, tracking starts before the person answers (`core/config/run_app.dart:64-65`). EDPB 05/2020 requires opt-in first. Fix: gate on the consent.
- **Fee-sharing risk (M, S).** Admin can set a fixed per-payment fee paid by the attorney (`case-payments/case-payments.settings.ts:32-38,266-269`). Bar opinions on Avvo's per-matter "marketing fee" (NJ ACPE 732 / CAA 54 / ACAMS 44, 2017) found that improper. Fix: allow only `feePayer: client`.
- **No "Attorney Advertising" label in the product (M, S).** The rule is only pushed onto attorneys in the terms (`assets/legal/terms.en.md:59-60`), although NY Rule 7.1(f) requires it. Fix: a per-state label on profiles and posts.
- **No accessibility statement (L, S).** `LegalDocType` has no entry for one (`schema.prisma:98-112`).

## 6. Costs at scale

- **Spend caps count calls, not money (M, S).** Translate spends one unit per call, while Google bills per character ([pricing](https://cloud.google.com/translate/pricing)). SMS has no per-country weighting, although prices differ by more than 30× ([Twilio](https://www.twilio.com/en-us/sms/pricing)) (`common/cost-guard/cost-guard.constants.ts:10-22`). The global cap is shared: 17 users at the 300/day per-user quota (`translation.service.ts:31`) use up the 5 000/day fallback for everyone (`config/env.schema.ts:490-494`). Fix: cap in dollars, weighted by country and characters.
- **Group and channel limits were removed (M, S)** (`docs/runbooks/RELEASE_20OCT_JOURNAL.md:92`). This opens spam and fan-out costs. Fix: restore generous caps.
- **TURN is one t4g.nano with no egress cap (M, M)** (`docs/runbooks/TURN.md:3-6`). Turning on `video_calls` makes it both a cost risk and a single point of failure.

## 7. Analytics and observability

- **No product analytics (H, M).** Only `app_open` and `screen_view` are sent (`core/diagnostics/app_events.dart:60`, `app_router.dart:114`). The server only keeps daily counts (`api/src/modules/analytics/app-events.service.ts:26-40`). None of the events in `docs/analytics_events.md` exist, so there are no funnels and no retention. Fix: a consented Firebase, Amplitude or PostHog setup with the documented events.
- **No business or synthetic alarms (M, S).** `infra/modules/monitoring/main.tf` has 24 infrastructure alarms, but nothing for signups, OTP success, call connect rate or push failures, and no uptime canary. Fix: SLO burn-rate alerts ([SRE](https://sre.google/workbook/alerting-on-slos/)).

## 8. Admin panel

- **The admin edits a feature the app no longer has (M, S).** "Справочник" (`admin/src/app/(app)/guide/page.tsx:50-80`) toggles `guide_section_1..8` (`feature-flags/flag-catalog.ts:150+`). No app reads these flags, and the route is only a leftover comment (`mobile/lib/core/navigation/app_routes.dart:178`).
- **Admin is in Russian only (M, M)** (`admin/src/lib/labels.tsx`). Moderators for 85 languages cannot be hired.

## 9. SEO and web

- **Shared links miss the SEO page (M, S).** The app shares `/lawyer/<u>` (`attorney_profile_view.dart:61-62`). The static page lives at `/attorneys/<u>/` (`scripts/seo/build.mjs:231`).
- **No `og:image` on SEO pages (M, S)** (`build.mjs:111-112`). The app's `og:image` is a relative path (`mobile/web/index.html:53`), but [OGP](https://ogp.me) needs an absolute URL. Fix: an absolute attorney photo.

## 10. Code health and tests

- **Critical paths have little or no testing (H, M).** `case-payments.service.ts` has 2 190 lines and only a settings spec plus one e2e (16 cases). `stripe-webhook.intake.ts` has no spec. `bid-packs` has none.
- **The search test is flaky (L, S).** `search-text-audit` uses a random 8-character token with typo-tolerant search (`RELEASE_20OCT_JOURNAL.md:90`). Fix: a fixed seed.

## Do first (ranked)

1. Deletion purges all media, Bunny, story files and the Stripe Customer (§5), M
2. Image and video moderation plus CSAM hashing (§5), M
3. Product analytics with funnels and consent gating (§7, §5), M
4. Persistent media send and upload queue (§3), M
5. Guest browsing (§2), M
6. Tests for case payments, webhooks and bid packs (§10), M
7. Server pushes in every language (§4), S
8. Unify Saved and Payments across roles (§1), S
9. Allow only client-paid fees (§5), S
10. Spend caps in dollars, per country and per character (§6), S
11. Restore group and channel limits (§6), S
12. Business SLO alerts and an uptime canary (§7), S
13. "Attorney Advertising" label (§5), S
14. Fix share URL and add `og:image` (§9), S
15. Remove the Справочник admin page and its dead flags (§8), S
16. Legal documents in the top languages (§4), M
17. Make the password optional after OTP (§2), S
18. One shared uploader with retry (§3), M
19. One profile shell for all roles (§1), L
20. Directional layout pass; TURN autoscaling (§4, §6), M
