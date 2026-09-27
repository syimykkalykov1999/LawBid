import 'package:package_info_plus/package_info_plus.dart';

/// The installed app's real version and package id, read once from the
/// platform (`package_info_plus`: Android `versionName`/`applicationId`,
/// iOS `CFBundleShortVersionString`/`CFBundleIdentifier`) — both come from
/// pubspec.yaml's `version:` via Flutter's build, so nothing has to be
/// kept in sync by hand any more (the old `HeadersInterceptor.appVersion`
/// constant did).
///
/// Sent as `X-App-Version` on every request (docs/01_FOUNDATION_AUTH.md
/// §7) and compared with `min_app_version_*` / `soft_update_version_*`
/// from `/config/bootstrap` (lib/core/app_update/app_update_providers.dart).
///
/// [load] runs in `runLawBid` BEFORE `runApp`, so every request —
/// including the splash's `/config/bootstrap` call — already carries the
/// real value.
abstract final class AppVersion {
  /// Used only when [load] was never called (widget tests) or the platform
  /// lookup failed. Deliberately a real-looking release, NOT `0.0.0`: a
  /// failed lookup must not make the server's `AppVersionGuard` answer
  /// every request with 426 (the app would brick itself); an unknown
  /// version is treated as "current".
  static const String fallback = '0.1.0';

  static String _version = fallback;
  static String? _packageName;

  /// Dotted version (`1.4.0`), without the build number.
  static String get current => _version;

  /// `com.lawbid.lawbid` (+ `.dev`/`.staging`), or null before [load].
  static String? get packageName => _packageName;

  /// Reads the platform values. Never throws.
  static Future<String> load({Future<PackageInfo> Function()? source}) async {
    try {
      final info = await (source ?? PackageInfo.fromPlatform)();
      final version = info.version.trim();
      if (version.isNotEmpty) _version = version;
      if (info.packageName.isNotEmpty) _packageName = info.packageName;
    } catch (_) {
      // Keep [fallback] — see its doc comment.
    }
    return _version;
  }

  /// Test hook: restores the pre-[load] state.
  static void resetForTest() {
    _version = fallback;
    _packageName = null;
  }
}
