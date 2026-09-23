import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../network/dio_client.dart';
import '../network/headers_interceptor.dart';
import 'default_feature_flags.dart';
import 'feature_flags_api_client.dart';
import 'feature_flags_state.dart';
import 'semver.dart';

part 'feature_flags_providers.g.dart';

/// `/config/bootstrap` HTTP client — see feature_flags_api_client.dart's
/// doc comment.
final featureFlagsApiClientProvider = Provider<FeatureFlagsApiClient>(
  (ref) => FeatureFlagsApiClient(ref.watch(dioProvider)),
);

/// Owns the app's known feature flags + app_config
/// (docs/01_FOUNDATION_AUTH.md §15 "Этап 1.8"). Deliberately simpler
/// than `L10nCacheController` (l10n_providers.dart): flags have no local
/// cache of their own (no Drift table, nothing seeded on disk) — there
/// is nothing here that needs to survive a cold start before the first
/// network round-trip, because [build] already returns a safe,
/// synchronous default ([defaultFeatureFlags]) that keeps the app fully
/// usable (in particular, the welcome screen's login buttons all render
/// enabled) before that first response ever lands. That default IS the
/// "local cache" — it's compiled in, not fetched, and it's exactly what
/// a freshly-seeded backend would return anyway (see
/// defaultFeatureFlags's doc comment) — so a second on-disk cache layer
/// would only add complexity for a value that already degrades
/// gracefully without one.
///
/// One entry point, called from `main.dart` AFTER `runApp` (non-blocking
/// — see that file): [refreshInBackground] fetches `/config/bootstrap`
/// and merges the result over [defaultFeatureFlags]. ANY failure
/// (offline, timeout, backend error, unexpected response shape) is
/// swallowed here, never rethrown — same "must never crash or block the
/// app" contract as `L10nRepository.refresh`'s doc comment. A flag
/// change in the DB (docs/01_FOUNDATION_AUTH.md §15 stage-1.8 acceptance
/// criterion: "смена флага в БД отражается в приложении без релиза
/// (после обновления bootstrap)") only needs to show up "after a
/// bootstrap update" — there is no requirement that it show up before
/// first paint — so a plain best-effort background fetch satisfies it;
/// nothing calls this again later (no periodic re-poll, no pull-to-
/// refresh hook) because §15 doesn't ask for that either, only for the
/// value to be current as of the next cold start.
@Riverpod(keepAlive: true)
class FeatureFlagsController extends _$FeatureFlagsController {
  @override
  FeatureFlagsState build() =>
      const FeatureFlagsState(flags: defaultFeatureFlags, appConfig: {});

  Future<void> refreshInBackground() async {
    try {
      final client = ref.read(featureFlagsApiClientProvider);
      final result = await client.getBootstrap();
      state = FeatureFlagsState(
        // An empty `flags` map (e.g. a future backend variant, or a
        // response the parser recognized no keys in) leaves the current
        // flags untouched rather than wiping them back to defaults —
        // mirrors L10nRepository.refresh's "nothing new -> null, caller
        // keeps its existing map" behavior.
        flags: result.flags.isEmpty ? state.flags : {...defaultFeatureFlags, ...result.flags},
        appConfig: result.appConfig,
      );
    } catch (_) {
      // Best-effort — see class doc comment. `state` already holds
      // `defaultFeatureFlags` (or whatever the last successful refresh
      // set), so there is nothing to reset here.
    }
  }
}

/// `true` when this device's own `HeadersInterceptor.appVersion` is
/// below the `min_app_version_{platform}` the last successful
/// `/config/bootstrap` call reported (docs/01_FOUNDATION_AUTH.md §7:
/// "426 Upgrade Required с кодом APP_UPDATE_REQUIRED"; §15 "Этап 1.8":
/// "поведение при APP_UPDATE_REQUIRED"). `false` (never blocking) until
/// that first response lands, and `false` again for any value this
/// client can't parse — see `isVersionBelow`'s doc comment. `app.dart`
/// watches this to show a full-screen, non-dismissible update gate; see
/// its `_UpdateRequiredGate` doc comment for what this pass does and
/// doesn't cover.
final isAppUpdateRequiredProvider = Provider<bool>((ref) {
  final state = ref.watch(featureFlagsControllerProvider);
  final minVersion = state.appConfig['min_app_version_${HeadersInterceptor.platformName}'];
  if (minVersion == null) return false;
  return isVersionBelow(HeadersInterceptor.appVersion, minVersion);
});
