# In-app review prompt — policy (no new UI)

The code already exists: `apps/mobile/lib/core/platform/review_prompter.dart` (`ReviewPrompter`, test `test/core/platform/review_prompter_test.dart`). It uses the stores' own dialogs (`in_app_review` package: StoreKit `SKStoreReviewController`, Google Play In-App Review). Nothing is added by this package.

## What it does today

- Behind the feature flag `in_app_review` — OFF by default (`default_feature_flags.dart`). Switch it on only after both store listings are live.
- Never on the web; at most once in 90 days per device (`ReviewPrompter.minInterval`); the date is stored before the dialog is requested, so a crash cannot cause a second request.
- Asked after a positive moment only: a 5-star review the user wrote about an attorney, a case the client confirmed as done, a confirmed consultation (checklist §27 in `docs/perf/SYSTEMS_CHECKLIST_2026-10-22.md`). Never after an error, never in a chat, never during sign-in.
- The stores decide themselves whether the dialog really shows (Apple: at most three times per 365 days; Google: its own quota), so a request is best effort and never throws. The event `review_prompted` is tracked.

## Policy for the owner

- Keep 90 days. The plan (§4) said 120 days, but Apple's own yearly cap already makes anything shorter harmless, and changing the constant buys nothing. If you want 120, one constant and its test change — tell the next helper.
- No rewards, bonuses or "5 stars for a gift" — both stores forbid it, and it also reads as an attempt to influence results (attorney-advertising rules).
- No "rate us" screen or button, no pre-filter ("are you happy?" then store only for happy users) — Apple and Google treat that as review gating.
- Answer every review in the store consoles by hand: App Store Connect -> Ratings and Reviews; Play Console -> Ratings and reviews. Never reply with a result promise.
- Do not reuse client reviews of attorneys inside store text.
