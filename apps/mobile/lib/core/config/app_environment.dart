import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The three installable app variants (p12 leaf-1.4, owner requirement):
/// they install side by side because each has its own bundle id /
/// applicationId suffix — see `android/app/build.gradle.kts`
/// (`productFlavors`) and the iOS `dev`/`staging`/`prod` schemes.
enum AppFlavor {
  /// "LawBid Dev", `com.lawbid.lawbid.dev` — local backend.
  dev,

  /// "LawBid Staging", `com.lawbid.lawbid.staging` — pre-release backend.
  staging,

  /// "LawBid", `com.lawbid.lawbid` — the build published to the App Store
  /// and Google Play.
  prod,
}

/// Per-flavor runtime settings, chosen by the entry point
/// (`lib/main_dev.dart`, `lib/main_staging.dart`, `lib/main_prod.dart`;
/// `lib/main.dart` is dev) before `runApp`.
///
/// The API base URL has a per-flavor default and can always be overridden
/// at build time without touching code:
///
/// ```sh
/// flutter run --flavor dev -t lib/main_dev.dart \
///   --dart-define-from-file=config/dev.json   # or --dart-define=API_BASE_URL=…
/// ```
///
/// The prod/staging defaults are PLACEHOLDERS the owner confirms once the
/// real hosts exist (docs/changelog.d/leaf-1.4.md) — the value that ships is
/// whatever `config/prod.json`'s `API_BASE_URL` says at build time.
class AppEnvironment {
  const AppEnvironment({
    required this.flavor,
    required this.apiBaseUrl,
    required this.deepLinkHost,
  });

  /// Builds the environment for [flavor], applying a non-empty
  /// `API_BASE_URL` / `DEEP_LINK_HOST` dart-define over the flavor default.
  factory AppEnvironment.forFlavor(
    AppFlavor flavor, {
    String apiBaseUrlOverride = _apiBaseUrlDefine,
    String deepLinkHostOverride = _deepLinkHostDefine,
  }) {
    return AppEnvironment(
      flavor: flavor,
      apiBaseUrl: apiBaseUrlOverride.isNotEmpty ? apiBaseUrlOverride : defaultApiBaseUrl(flavor),
      deepLinkHost: deepLinkHostOverride.isNotEmpty ? deepLinkHostOverride : defaultDeepLinkHost,
    );
  }

  static const String _apiBaseUrlDefine = String.fromEnvironment('API_BASE_URL');
  static const String _deepLinkHostDefine = String.fromEnvironment('DEEP_LINK_HOST');

  /// docs/01_FOUNDATION_AUTH.md §12: universal/app links live on
  /// `lawbid.app`. Must match the iOS `DEEP_LINK_HOST` build setting and
  /// the Android `lawbid.deepLinkHost` Gradle property.
  static const String defaultDeepLinkHost = 'lawbid.app';

  /// Per-flavor API defaults. dev: `10.0.2.2` is the Android emulator's
  /// alias for the host's `localhost` (iOS simulator: pass
  /// `API_BASE_URL=http://localhost:3000/api/v1`; a device needs a LAN IP).
  /// staging/prod: owner-configurable placeholders.
  static String defaultApiBaseUrl(AppFlavor flavor) => switch (flavor) {
        AppFlavor.dev => 'http://10.0.2.2:3000/api/v1',
        AppFlavor.staging => 'https://staging-api.lawbid.app/api/v1',
        AppFlavor.prod => 'https://api.lawbid.app/api/v1',
      };

  final AppFlavor flavor;
  final String apiBaseUrl;
  final String deepLinkHost;

  bool get isProd => flavor == AppFlavor.prod;

  /// Launcher / display name — the same string the native side sets
  /// (Android `app_name` resValue, iOS `APP_DISPLAY_NAME`); used as the
  /// in-app `MaterialApp.title` so the task switcher matches.
  String get appName => switch (flavor) {
        AppFlavor.dev => 'LawBid Dev',
        AppFlavor.staging => 'LawBid Staging',
        AppFlavor.prod => 'LawBid',
      };

  /// The environment the running app was started with. Set once by
  /// `runLawBid` (core/config/run_app.dart) before anything reads it; the
  /// dev default keeps `flutter test` (which never calls an entry point)
  /// working unchanged.
  static AppEnvironment current = AppEnvironment.forFlavor(AppFlavor.dev);
}

/// Riverpod access to [AppEnvironment.current] (overridable in tests).
final appEnvironmentProvider = Provider<AppEnvironment>((ref) => AppEnvironment.current);
