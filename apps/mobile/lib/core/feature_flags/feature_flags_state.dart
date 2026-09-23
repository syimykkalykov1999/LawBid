import 'default_feature_flags.dart';

/// [FeatureFlagsController]'s state (feature_flags_providers.dart):
/// the last-known flag map and the `app_config` map `/config/bootstrap`
/// returned alongside it (min/soft update versions — see
/// `isAppUpdateRequiredProvider`). Bundled into one class (rather than
/// two separate providers) because both always come from, and are
/// replaced by, the same single bootstrap response.
class FeatureFlagsState {
  const FeatureFlagsState({required this.flags, required this.appConfig});

  final Map<String, bool> flags;
  final Map<String, String> appConfig;

  /// `false` for a flag this client has never heard of AND that isn't in
  /// [defaultFeatureFlags] either — the same "unknown -> off" reasoning
  /// as an admin-only feature the client predates.
  bool isEnabled(String key) => flags[key] ?? defaultFeatureFlags[key] ?? false;
}
