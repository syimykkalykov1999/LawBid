import 'app_language.dart';
import 'static_translator.dart';
import 'translator.dart';

/// The real, backend-driven [Translator] (docs/01_FOUNDATION_AUTH.md §9.4).
/// SAME public shape as the stage-1.5 stopgap it replaces (`t(key,
/// [params])`, synchronous — see translator.dart's doc comment), so every
/// existing `ref.watch(translatorProvider).t('key')` call site is
/// unaffected; only `l10n_providers.dart`'s provider implementation
/// changed.
///
/// Layered fallback, cheapest/freshest source first:
///   1. [cache] — the Drift-backed bundle for [language], last synced via
///      `GET /i18n/bundle/:lang` (full or delta). See
///      `l10n_providers.dart`'s `L10nCacheController` for how/when this is
///      loaded.
///   2. The compiled-in seed map for [language]
///      (`StaticTranslatorRu`/`StaticTranslatorEn.seedEntries` —
///      static_translator.dart) — covers a brand-new install before the
///      first successful network round-trip ever completes, and any key
///      that's newer on the client than the last synced bundle (e.g. a
///      key just added to the app that the backend's translation table
///      hasn't caught up to yet).
///   3. The raw key string, via `_seed.t(key)`'s own existing
///      never-null behavior (`_MapTranslator.t`, static_translator.dart) —
///      so a totally unknown key still renders something instead of
///      crashing or going blank, per docs/01_FOUNDATION_AUTH.md §9.1's
///      "встроенный fallback... на случай отсутствия сети", extended here
///      to "on any cache miss," not just first launch.
///
/// [t] must stay synchronous: every call site invokes it inline during
/// `build()`. [cache] is therefore always a plain, already-resolved
/// in-memory map — never queried from Drift per key.
class L10nTranslator implements Translator {
  const L10nTranslator({required this.language, required this.cache});

  final AppLanguage language;
  final Map<String, String> cache;

  @override
  String t(String key, [Map<String, String>? params]) {
    // `_seed.t(key)` is layers 2+3 in one call — see class doc — so
    // `value` is never null/missing by the time interpolation runs below.
    var value = cache[key] ?? _seed.t(key);
    if (params == null) return value;
    for (final entry in params.entries) {
      value = value.replaceAll('{${entry.key}}', entry.value);
    }
    return value;
  }

  Translator get _seed => switch (language) {
    AppLanguage.ru => const StaticTranslatorRu(),
    AppLanguage.en => const StaticTranslatorEn(),
  };
}
