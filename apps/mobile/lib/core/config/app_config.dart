import 'package:flutter/foundation.dart';

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
/// Only PUBLIC client identifiers belong here (OAuth client ids, Stripe
/// publishable key) — they ship inside the app binary anyway. Server
/// secrets never go into the mobile app.
///
/// iOS additionally needs GOOGLE_REVERSED_CLIENT_ID as a URL scheme; that
/// one lives in `ios/Flutter/Secrets.xcconfig` (Info.plist can only read
/// Xcode build settings, not dart-defines).
abstract final class AppConfig {
  // The backend base URL (`API_BASE_URL`) moved to AppEnvironment
  // (app_environment.dart) in p12 leaf-1.4: it now has a per-flavor
  // default (dev/staging/prod) that the define overrides.

  /// Google Cloud Console → Credentials → OAuth client (type iOS).
  /// Ends with `.apps.googleusercontent.com`. Empty = not configured.
  static const String googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
  );

  /// Google Cloud Console → Credentials → OAuth client (type Web
  /// application). Becomes the `aud` of the ID token the backend verifies
  /// (so it must also be listed in the API's GOOGLE_CLIENT_IDS). Required
  /// on Android.
  static const String googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );

  /// Stripe Dashboard → Developers → API keys → Publishable key
  /// (`pk_test_…` / `pk_live_…`). Read by `StripeCardCollector`
  /// (docs/06_PRODUCTION.md §1.4, stage 6.8) on the first card sheet; an
  /// empty value makes the subscribe button report "оплата не настроена".
  static const String stripePublishableKey = String.fromEnvironment(
    'STRIPE_PUBLISHABLE_KEY',
  );

  /// Store release 2026-10-06: whether this build can finish a Google
  /// sign-in on [platform] (iOS needs GOOGLE_IOS_CLIENT_ID, Android
  /// GOOGLE_SERVER_CLIENT_ID).
  static bool googleSignInConfigured(TargetPlatform platform) =>
      switch (platform) {
        TargetPlatform.iOS => googleIosClientId.isNotEmpty,
        TargetPlatform.android => googleServerClientId.isNotEmpty,
        _ => false,
      };

  /// Sign in with Apple runs natively on iOS only; Android would need an
  /// Apple Services ID + web redirect, which this app does not configure.
  static bool appleSignInSupported(TargetPlatform platform) =>
      platform == TargetPlatform.iOS;

  /// `null` for an empty define, so callers can pass it straight to SDKs
  /// that treat `null` as "not provided".
  static String? orNull(String value) => value.isEmpty ? null : value;
}
