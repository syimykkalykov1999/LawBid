import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/legal_document.dart';

/// `FeatureFlagsController`'s state (feature_flags_providers.dart):
/// the last-known flag map and the `app_config` map `/config/bootstrap`
/// returned alongside it (min/soft update versions — see
/// `isAppUpdateRequiredProvider`). Bundled into one class (rather than
/// two separate providers) because both always come from, and are
/// replaced by, the same single bootstrap response.
class FeatureFlagsState {
  const FeatureFlagsState({
    required this.flags,
    required this.appConfig,
    this.legalDocuments = const [],
  });

  final Map<String, bool> flags;
  final Map<String, String> appConfig;

  /// A numeric app_config value the owner can change in the admin panel.
  int configInt(String key, int fallback) =>
      num.tryParse(appConfig[key] ?? '')?.toInt() ?? fallback;

  /// Current legal documents from the same bootstrap response (stage 1.7
  /// mobile: the consents step links Terms/Privacy/Disclaimer to these).
  final List<LegalDocument> legalDocuments;

  /// `false` for a flag this client has never heard of AND that isn't in
  /// [defaultFeatureFlags] either — the same "unknown -> off" reasoning
  /// as an admin-only feature the client predates.
  bool isEnabled(String key) => flags[key] ?? defaultFeatureFlags[key] ?? false;
}
