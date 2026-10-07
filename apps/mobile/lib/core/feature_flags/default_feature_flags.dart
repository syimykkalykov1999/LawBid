/// Safe fallback flag values — used for first paint (before the first
/// `/config/bootstrap` response ever lands) and as the base a real
/// response is merged onto (see `FeatureFlagsController.refreshInBackground`
/// in feature_flags_providers.dart), so an unrecognized/missing key in a
/// future response still resolves to something sane instead of `null`.
///
/// Deliberately NOT all-`false`: these are copied verbatim from
/// `apps/api/prisma/seed.ts`'s `seedFeatureFlags()` — the exact starter
/// values docs/01_FOUNDATION_AUTH.md §15 "Этап 1.8" names — so a
/// fetch failure (offline first launch, backend down) leaves the app
/// behaving exactly as a freshly-seeded backend would, not as if every
/// login method had been turned off. Unfinished-feature flags
/// (`video_posts`, `profile_promotion`, `stripe_identity`,
/// `persona_verification`, `auto_bar_check`) default `false` because
/// there is no UI for them yet regardless of what the backend says;
/// login-method flags default `true` because defaulting them off would
/// make a fetch failure look like every sign-in method was
/// simultaneously disabled — a far worse failure mode than briefly
/// showing a button for a method that then 403s.
const Map<String, bool> defaultFeatureFlags = {
  'video_posts': false,
  'profile_promotion': false,
  'stripe_identity': false,
  'persona_verification': false,
  'auto_bar_check': false,
  'chat_translate': false,
  // Owner 2026-10-05: «Перевести» per zone (the API sends the real values).
  'translate_posts': false,
  'translate_cases': false,
  'translate_reviews': false,
  'translate_profiles': false,
  'payments_in_app': false,
  // Owner 2026-10-05: on only with TURN configured (bootstrap gate).
  'video_calls': false,
  // Owner 2026-10-05: the document templates library (on).
  'document_templates': true,
  // Owner 2026-10-06: News is switched off (kept in code).
  'news_posts': false,
  'phone_login': true,
  // Owner 2026-10-07: «Вход и письма по почте» — off until Amazon SES
  // may write to any address; a fetch failure must not show e-mail forms.
  'email_login': false,
  'apple_login': true,
  'google_login': true,
};
