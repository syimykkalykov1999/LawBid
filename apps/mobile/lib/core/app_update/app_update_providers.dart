import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_environment.dart';
import '../feature_flags/feature_flags_providers.dart';
import '../feature_flags/semver.dart';
import '../network/headers_interceptor.dart';
import '../persistence/persistence_providers.dart';
import 'app_version.dart';

/// What the update gate (app_update_gate.dart) shows
/// (docs/01_FOUNDATION_AUTH.md §7, §12 "принудительное и мягкое
/// обновление приложения через флаги", §15 "Этап 1.8").
enum AppUpdateStatus {
  /// Nothing to show.
  upToDate,

  /// `soft_update_version_{platform}` is newer than this build and the
  /// user hasn't dismissed the prompt for that version: a dismissible
  /// prompt.
  softUpdateAvailable,

  /// Below `min_app_version_{platform}` (bootstrap) OR any request came
  /// back `426 APP_UPDATE_REQUIRED`: the non-dismissible forced-update
  /// screen.
  updateRequired,
}

/// Flipped to true by [AppUpdateInterceptor] the moment ANY request is
/// answered with `426 APP_UPDATE_REQUIRED` (the server's `AppVersionGuard`
/// is authoritative — the bootstrap `min_app_version_*` self-check only
/// covers what the client already knew at startup). Never flips back for
/// the life of the process: the only way out is installing a newer build.
class ForcedUpdateController extends Notifier<bool> {
  @override
  bool build() => false;

  void markRequired() {
    if (!state) state = true;
  }
}

final forcedUpdateProvider =
    NotifierProvider<ForcedUpdateController, bool>(ForcedUpdateController.new);

const _kSoftDismissedKey = 'app_update.soft_dismissed_version';

/// The `soft_update_version_*` value the user last tapped "Later" on,
/// persisted so the prompt doesn't nag on every launch — it comes back
/// only when the server announces a NEWER soft version.
class SoftUpdateDismissalController extends Notifier<String?> {
  @override
  String? build() => ref.read(localKvStoreProvider).getString(_kSoftDismissedKey);

  Future<void> dismiss(String softVersion) async {
    state = softVersion;
    await ref.read(localKvStoreProvider).setString(_kSoftDismissedKey, softVersion);
  }
}

final softUpdateDismissalProvider =
    NotifierProvider<SoftUpdateDismissalController, String?>(SoftUpdateDismissalController.new);

/// `soft_update_version_{platform}` from the last `/config/bootstrap`, or
/// null when absent.
final softUpdateVersionProvider = Provider<String?>((ref) {
  final config = ref.watch(featureFlagsControllerProvider.select((s) => s.appConfig));
  final value = config['soft_update_version_${HeadersInterceptor.platformName}']?.trim();
  return (value == null || value.isEmpty) ? null : value;
});

final appUpdateStatusProvider = Provider<AppUpdateStatus>((ref) {
  if (ref.watch(forcedUpdateProvider) || ref.watch(isAppUpdateRequiredProvider)) {
    return AppUpdateStatus.updateRequired;
  }
  final soft = ref.watch(softUpdateVersionProvider);
  if (soft == null || !isVersionBelow(AppVersion.current, soft)) {
    return AppUpdateStatus.upToDate;
  }
  // Dismissed for this soft version (or a newer one) → quiet.
  final dismissed = ref.watch(softUpdateDismissalProvider);
  if (dismissed != null && !isVersionBelow(dismissed, soft)) {
    return AppUpdateStatus.upToDate;
  }
  return AppUpdateStatus.softUpdateAvailable;
});

/// Where "Update" sends the user. Owner-configurable without a release via
/// `app_config.store_url_{platform}` (admin panel); otherwise the Google
/// Play listing of this build's own applicationId on Android, and the App
/// Store listing from the `APP_STORE_ID` dart-define on iOS (the numeric
/// id App Store Connect assigns — unknown until the app is registered).
/// Null when nothing is known yet; the gate then says so instead of
/// opening a dead link.
final storeUrlProvider = Provider<Uri?>((ref) {
  final platform = HeadersInterceptor.platformName;
  final config = ref.watch(featureFlagsControllerProvider.select((s) => s.appConfig));
  final configured = Uri.tryParse(config['store_url_$platform']?.trim() ?? '');
  // https only: the value is admin-configured, but the app must never
  // launch another scheme from server data (defense in depth).
  if (configured != null && configured.scheme == 'https' && configured.host.isNotEmpty) {
    return configured;
  }
  if (platform == 'android') {
    final packageName =
        AppVersion.packageName ?? _defaultPackageName(ref.watch(appEnvironmentProvider));
    return Uri.https('play.google.com', '/store/apps/details', {'id': packageName});
  }
  const appStoreId = String.fromEnvironment('APP_STORE_ID');
  if (appStoreId.isEmpty) return null;
  return Uri.https('apps.apple.com', '/app/id$appStoreId');
});

String _defaultPackageName(AppEnvironment env) => switch (env.flavor) {
      AppFlavor.dev => 'com.lawbid.lawbid.dev',
      AppFlavor.staging => 'com.lawbid.lawbid.staging',
      AppFlavor.prod => 'com.lawbid.lawbid',
    };
