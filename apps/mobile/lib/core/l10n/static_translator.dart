import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/plural_rules.dart';
import 'package:lawbid/core/l10n/static_strings.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Stage-1.5-originated stopgap [Translator], now bilingual (owner request,
/// 2026-09-22): a working RU/EN toggle on the welcome screen, ahead of the
/// real i18n system (backend-driven languages, xlsx import/export, drift
/// cache, live switching — file 01 §15, stage 1.6, not yet built).
///
/// Every key that existed in the app (not just auth/onboarding) has an
/// English counterpart here, specifically so switching languages never hits
/// the `assert(value != null, ...)` below on a stub screen that only had
/// Russian before.
///
/// UPDATE, stage 1.6 (docs/CHANGELOG.md): this file is NOT replaced —
/// `L10nTranslator` (l10n_translator.dart) keeps these two classes as its
/// seed/fallback layer (compiled-in strings for a brand-new install before
/// any network round-trip, and for any key a synced bundle doesn't have
/// yet), via the [seedEntries] getter below. Call sites (`t('key')`) still
/// don't change — only `l10n_providers.dart`'s `translatorProvider`
/// implementation does.
///
/// File 01 §1 specifies English as the DEFAULT interface language — see
/// `LocalLanguageRepository` in local_language_repository.dart, which
/// defaults to [AppLanguage.en] when nothing has been persisted yet.
abstract class _MapTranslator implements Translator {
  const _MapTranslator();

  Map<String, String> get _strings;

  /// Public view of [_strings] — stage 1.6's `L10nTranslator`
  /// (l10n_translator.dart) uses this both to pre-seed the Drift cache on a
  /// brand-new install (`L10nDatabase.seedIfEmpty`) and as the compiled-in
  /// fallback layer for any key a synced bundle doesn't (yet) have. Added
  /// for that reuse, not a change to this class's own behavior.
  Map<String, String> get seedEntries => _strings;

  /// ISO 639-1 code of this map's language — drives [plural]'s CLDR rules.
  String get languageCode;

  @override
  String t(String key, [Map<String, String>? params]) {
    final value = _strings[key];
    assert(value != null, 'Missing translation key: $key');
    return interpolate(value ?? key, params);
  }

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      pluralize(
        languageCode: languageCode,
        key: key,
        count: count,
        lookup: (k) => _strings[k],
        params: params,
      );
}

/// The compiled-in strings for [code], or `null` for a language that only
/// exists on the server (docs/01_FOUNDATION_AUTH.md §9.1: the compiled-in
/// set is the offline fallback; English is the mandatory one). On the web
/// also `null` until [loadBuiltInStrings] has read the asset.
Map<String, String>? compiledSeedFor(String code) => builtInStrings(code);

/// Russian strings — the original stage-1.5/1.7 table, unchanged in content
/// (static_strings_compiled.dart; on the web the same rows from an asset).
class StaticTranslatorRu extends _MapTranslator {
  const StaticTranslatorRu();

  @override
  String get languageCode => 'ru';

  @override
  Map<String, String> get _strings => builtInStrings('ru') ?? const {};
}

/// English strings — the default language per file 01 §1.
class StaticTranslatorEn extends _MapTranslator {
  const StaticTranslatorEn();

  @override
  String get languageCode => 'en';

  @override
  Map<String, String> get _strings => builtInStrings('en') ?? const {};
}
