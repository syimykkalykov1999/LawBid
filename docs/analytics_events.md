# Analytics events

Schema of product analytics events (docs/01 §12 "Аналитика событий (с учётом согласия)").
Events are sent **only** when the user granted the `analytics` consent
(`user_consents`, docs/01 §10.2 H); without it nothing is recorded. The SDK
(Firebase Analytics, docs/01 §5.1) needs the owner's Firebase project and is
wired once its config files exist (docs/KEYS_SETUP.md).

What the app actually sends (owner 2026-10-15, checked 2026-10-22, checklist §18):
the phone queues **event names only** — `AppEvents.track(name)` in
`apps/mobile/lib/core/diagnostics/app_events.dart`, names from
`app_event_names.dart` — and posts them in batches to `POST /app-events`,
which counts per day. No properties leave the phone; the property columns
below describe the moment, not a payload. `screen_view` carries the
normalised route (ids and query strings removed). The test
`apps/mobile/test/core/diagnostics/app_event_names_test.dart` keeps this
document and the code in step: every name the app can send is in a table
here, and every name in a table is either sent by the app or listed under
«Not sent».

Rules
- Names: `snake_case`, verb in the past tense where it describes a fact.
- Never send personal data: no names, phone numbers, emails, free text,
  case descriptions, exact addresses. IDs are internal UUIDs only.
- Common properties on every event: `platform` (`ios` | `android`),
  `app_version`, `app_env` (`dev` | `staging` | `prod`), `ui_language`,
  `role` (`client` | `attorney` | `null`).

## App

| Event | When | Properties |
|---|---|---|
| `app_open` | the app started (and on the web, the moment the person accepted the notice) | — |
| `screen_view` | the router opened a screen (the same screen twice in a row counts once) | `screen` (normalised route) |
| `review_prompted` | the store's in-app review dialog was requested (`in_app_review`, at most once in 90 days, flag `in_app_review`) | — |
| `post_not_interested` | the person hid someone else's post with «Not interested» in the post's ⋯ menu (owner row 112; the post stays hidden on that device) | — |
| `hotline_request` | the client pressed «Позвонить» on the hotline form (owner row 87) | — |
| `hotline_cancel` | the client cancelled the hotline request or left the queue | — |
| `hotline_languages` | «Поменять язык» while waiting on the hotline | — |
| `hotline_notify` | «Сообщите, когда появится адвокат» | — |
| `hotline_claim` | «Позвонить сейчас» / «Вернуться в очередь» | — |
| `hotline_connected` | an attorney took the hotline call; the 1:1 call screen opened | — |
| `hotline_review` | the review after a hotline call was sent | — |
| `hotline_offer_case` | «Предложить дело» in a hotline call | — |

## Service level as the person sees it (Б6, 25.11)

Counted after the app's own retries (`lib/core/diagnostics/client_sli.dart`), only while `client.sli_enabled` is on, and only with the usage statistics consent like every event here. The server does not store them per day: it adds them to its minute line `{metric:"slo_client"}` for the SLO alarms (`infra/modules/monitoring/user-slis.tf`).

| Event | When | Properties |
|---|---|---|
| `sli_login_ok` | sign-in (code, password, Google / Apple): worked | — |
| `sli_login_fail` | sign-in (code, password, Google / Apple): failed for the person: a 5xx or a timeout after the app's own retries (a 4xx or an offline phone is not counted) | — |
| `sli_feed_ok` | opening the feed: worked | — |
| `sli_feed_slow` | opening the feed: worked, but slower than its goal (`client.sli_feed_slow_ms` / `client.sli_message_slow_ms`) | — |
| `sli_feed_fail` | opening the feed: failed for the person: a 5xx or a timeout after the app's own retries (a 4xx or an offline phone is not counted) | — |
| `sli_message_ok` | sending a chat message: worked | — |
| `sli_message_slow` | sending a chat message: worked, but slower than its goal (`client.sli_feed_slow_ms` / `client.sli_message_slow_ms`) | — |
| `sli_message_fail` | sending a chat message: failed for the person: a 5xx or a timeout after the app's own retries (a 4xx or an offline phone is not counted) | — |
| `sli_pay_ok` | starting a payment (subscription checkout, pay session): worked | — |
| `sli_pay_fail` | starting a payment (subscription checkout, pay session): failed for the person: a 5xx or a timeout after the app's own retries (a 4xx or an offline phone is not counted) | — |
| `sli_call_ok` | starting, accepting or joining a call: worked | — |
| `sli_call_fail` | starting, accepting or joining a call: failed for the person: a 5xx or a timeout after the app's own retries (a 4xx or an offline phone is not counted) | — |
| `sli_push_ok` | opening a push (ok = it led to its screen): worked | — |
| `sli_push_fail` | opening a push (ok = it led to its screen): failed for the person: a 5xx or a timeout after the app's own retries (a 4xx or an offline phone is not counted) | — |

## Website speed: Core Web Vitals (Б6 / G8, 25.11)

Sent by `web/js/web_vitals_beacon.js` (web-vitals 6.2.3, Apache-2.0) with `navigator.sendBeacon` when the page is hidden; only the rating, no value, no address; only with the usage statistics consent and `client.web_vitals_enabled`. Not stored per day either (minute line `{metric:"slo_client"}`; alarm when fewer than 75 % of visits are «good»).

| Event | When | Properties |
|---|---|---|
| `web_vital_lcp_good` | the website's LCP of this visit was rated good (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_lcp_ni` | the website's LCP of this visit was rated needs improvement (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_lcp_poor` | the website's LCP of this visit was rated poor (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_inp_good` | the website's INP of this visit was rated good (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_inp_ni` | the website's INP of this visit was rated needs improvement (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_inp_poor` | the website's INP of this visit was rated poor (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_cls_good` | the website's CLS of this visit was rated good (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_cls_ni` | the website's CLS of this visit was rated needs improvement (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_cls_poor` | the website's CLS of this visit was rated poor (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_ttfb_good` | the website's TTFB of this visit was rated good (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_ttfb_ni` | the website's TTFB of this visit was rated needs improvement (web.dev thresholds), sent once when the page is hidden | — |
| `web_vital_ttfb_poor` | the website's TTFB of this visit was rated poor (web.dev thresholds), sent once when the page is hidden | — |

## Authentication and onboarding (file 01)

| Event | When | Properties |
|---|---|---|
| `otp_requested` | a code was requested | `channel` (`phone` \| `email`), `purpose` (`login` \| `contact` \| `reauth`) |
| `login_success` | tokens issued | `method`, `is_new_user` (bool) |
| `login_failure` | sign-in failed | `method`, `error_code` (ErrorCode value) |
| `consents_accepted` | onboarding consents step saved | `marketing_email`, `marketing_push`, `analytics` (bools) |
| `role_selected` | role set | `role` |
| `contacts_verified` | a required contact became verified | `type` (`phone` \| `email`) |
| `profile_completed` | onboarding profile step saved | `role` |
| `onboarding_completed` | server accepted onboarding completion | `role`, `duration_sec` |
| `signup_completed` | same moment as `onboarding_completed` for new users | `role` |
| `logout` | user logged out | `scope` (`device` \| `all`) |
| `account_deletion_requested` | deletion confirmed | — |
| `app_update_prompted` | soft or forced update shown | `kind` (`soft` \| `forced`) |

## Not sent

| Event | Why |
|---|---|
| `signup_started` | the phone cannot tell a brand-new identifier from a returning one before the server answers; `otp_requested` + `login_success` cover the funnel |
| `tour_skipped` | the onboarding tour was removed (owner 2026-10-04) |

## Later files

Events for verification (file 03), cases and bids (file 04), feed/chats
(file 05) and subscription (file 06) are added to this file in the stage
that implements them.
