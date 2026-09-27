# Analytics events

Schema of product analytics events (docs/01 §12 "Аналитика событий (с учётом согласия)").
Events are sent **only** when the user granted the `analytics` consent
(`user_consents`, docs/01 §10.2 H); without it nothing is recorded. The SDK
(Firebase Analytics, docs/01 §5.1) needs the owner's Firebase project and is
wired once its config files exist (docs/KEYS_SETUP.md).

Rules
- Names: `snake_case`, verb in the past tense where it describes a fact.
- Never send personal data: no names, phone numbers, emails, free text,
  case descriptions, exact addresses. IDs are internal UUIDs only.
- Common properties on every event: `platform` (`ios` | `android`),
  `app_version`, `app_env` (`dev` | `staging` | `prod`), `ui_language`,
  `role` (`client` | `attorney` | `null`).

## Authentication and onboarding (file 01)

| Event | When | Properties |
|---|---|---|
| `signup_started` | first OTP/social attempt of a brand-new identifier | `method` (`phone` \| `email` \| `apple` \| `google`) |
| `otp_requested` | a code was requested | `channel` (`phone` \| `email`), `purpose` (`login` \| `contact` \| `reauth`) |
| `login_success` | tokens issued | `method`, `is_new_user` (bool) |
| `login_failure` | sign-in failed | `method`, `error_code` (ErrorCode value) |
| `consents_accepted` | onboarding consents step saved | `marketing_email`, `marketing_push`, `analytics` (bools) |
| `role_selected` | role set | `role` |
| `contacts_verified` | a required contact became verified | `type` (`phone` \| `email`) |
| `profile_completed` | onboarding profile step saved | `role` |
| `onboarding_completed` | server accepted onboarding completion | `role`, `duration_sec` |
| `tour_skipped` | the tour was skipped | `page` (1-3) |
| `signup_completed` | same moment as `onboarding_completed` for new users | `role` |
| `logout` | user logged out | `scope` (`device` \| `all`) |
| `account_deletion_requested` | deletion confirmed | — |
| `app_update_prompted` | soft or forced update shown | `kind` (`soft` \| `forced`) |

## Later files

Events for verification (file 03), cases and bids (file 04), feed/chats
(file 05) and subscription (file 06) are added to this file in the stage
that implements them.
