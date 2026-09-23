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
  'phone_login': true,
  'email_login': true,
  'apple_login': true,
  'google_login': true,
};
