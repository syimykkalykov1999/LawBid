/// Build-time client configuration — the ONE place the app reads
/// environment-specific ids from (docs/KEYS_SETUP.md).
///
/// Values come from `--dart-define-from-file=config/<flavor>.json` (copy
/// `config/<flavor>.example.json`; the real `config/*.json` files are
/// gitignored) or individual `--dart-define=KEY=value` flags:
///
/// ```sh
/// flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json
/// ```
///
/// Only PUBLIC client identifiers belong here (Stripe publishable key,
/// store id) — they ship inside the app binary anyway. Server
/// secrets never go into the mobile app.
abstract final class AppConfig {
  // The backend base URL (`API_BASE_URL`) moved to AppEnvironment
  // (app_environment.dart) in p12 leaf-1.4: it now has a per-flavor
  // default (dev/staging/prod) that the define overrides.

  /// Stripe Dashboard → Developers → API keys → Publishable key
  /// (`pk_test_…` / `pk_live_…`). Read by `StripeCardCollector`
  /// (docs/06_PRODUCTION.md §1.4, stage 6.8) on the first card sheet; an
  /// empty value makes the subscribe button report "оплата не настроена".
  static const String stripePublishableKey = String.fromEnvironment(
    'STRIPE_PUBLISHABLE_KEY',
  );

  /// `null` for an empty define, so callers can pass it straight to SDKs
  /// that treat `null` as "not provided".
  static String? orNull(String value) => value.isEmpty ? null : value;
}
