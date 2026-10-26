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
