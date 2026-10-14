# Regression matrix: key scenarios and the tests that guard them

Owner 2026-10-14: the logic must not break while the design changes.
Every row below has an automatic test that runs on every pull request
(`api-ci.yml`: unit + e2e on PostgreSQL; `mobile-ci.yml`: `flutter test`
with goldens). Before a design PR, run the API suites of the touched
section and all of `flutter test`.

| Scenario | API tests (apps/api) | App tests (apps/mobile) |
|---|---|---|
| Sign-in by phone code, refresh, sessions | `test/auth`, `auth-hardening`, `db-sessions`, `owner-single-device` | `test/features/auth` |
| Password sign-in, forgot password by SMS only, set password | `src/modules/auth/password-auth.service.spec.ts`, `magic-link` | `test/features/auth/password_screens_test.dart` |
| Demo code and demo accounts | `src/modules/demo/*.spec.ts`, `src/common/demo/demo-context.spec.ts` | `test/core/navigation/app_router_guard_test.dart` |
| Search people / cases / posts / tags and their filters | `owner-people-search`, `owner-search-filters`, `owner-filters-audit`, `owner-mine-filters`, `stage-5-6` | `test/features/search/search_results_test.dart` |
| Feed and posts (filters, hidden qualification tags, limits) | `stage-5-1`, `owner-feed-content`, `owner-post-practice` | `test/features/feed`, `test/features/social` |
| Case → bid → accept (also from another state) → chat / tasks / files | `stage-4-1` … `stage-4-8`, `stage-4-mine`, `owner-direct-chats`, `owner-tasks-planner`, `files` | `test/features/cases`, `test/features/chat` |
| Subscription from the admin plan builder reaches both roles, and ends after cancel | `owner-plan-builder` (incl. "custom plan turns its functions on for both roles and off after cancel"), `stage-6-7`, `owner-subscription-cancel`, `owner-subscription-alerts` | `test/features/subscription`, `test/features/client_plan`, `test/features/plans` |
| Assistants: seats, one-time codes, duties | `owner-assistants`, `owner-seat-limit` | `test/features/team` |
| Anti-fraud and spam protection | `src/modules/client-fraud/*.spec.ts`, `cost-guard`, `security-hardening`, `owner-blocks` | `test/features/trust` |
| Calls, chat translation, video posts, case promotion (plan terms) | `owner-calls`, `owner-plan-builder`, `owner-case-urgency` | `test/features/calls`, `test/features/reels` |
| Layout at 360 dp in long languages | – | `test/overflow/long_locale_overflow_test.dart` |

Adding a section or a gate means adding its row here and a test that fails
when the rule breaks.
