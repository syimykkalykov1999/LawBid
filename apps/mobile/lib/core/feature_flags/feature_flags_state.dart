import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/legal_document.dart';

/// app_config keys of the text-message consent wording the admin keeps
/// under «Соответствие» (FR D-c2); the server sends the text only once the
/// admin stored one, the version always.
const kSmsDisclosureTextConfig = 'compliance.sms.disclosure_text';
const kSmsDisclosureVersionConfig = 'compliance.sms.disclosure_version';

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

  /// A text the owner wrote in the admin panel, or null when there is
  /// none (absent or blank) — the caller then shows its own translated
  /// string. Owner 2026-11-09 (FR D-c2): the SMS consent wording.
  String? configText(String key) {
    final v = appConfig[key]?.trim();
    return v == null || v.isEmpty ? null : v;
  }

  /// Current legal documents from the same bootstrap response (stage 1.7
  /// mobile: the consents step links Terms/Privacy/Disclaimer to these).
  final List<LegalDocument> legalDocuments;

  /// `false` for a flag this client has never heard of AND that isn't in
  /// [defaultFeatureFlags] either — the same "unknown -> off" reasoning
  /// as an admin-only feature the client predates.
  bool isEnabled(String key) => flags[key] ?? defaultFeatureFlags[key] ?? false;

  /// Owner 2026-11-08 (one control for translation): «Перевести» in a zone
  /// ([zoneFlag] = `translate_chat`, `translate_posts`…) shows only while
  /// the master `chat_translate` is on AND the zone follows it. A server
  /// one release older sends no `translate_chat` (its `chat_translate` was
  /// the chat zone itself), so the master alone decides there.
  bool translationOn(String zoneFlag) {
    if (!isEnabled('chat_translate')) return false;
    if (zoneFlag == 'translate_chat' && !flags.containsKey(zoneFlag)) {
      return true;
    }
    return isEnabled(zoneFlag);
  }
}
