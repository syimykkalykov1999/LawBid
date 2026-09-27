import 'app_language.dart';
import 'plural_rules.dart';
import 'static_translator.dart';
import 'translator.dart';

/// The real, backend-driven [Translator] (docs/01_FOUNDATION_AUTH.md §9.4).
/// Synchronous `t(key, [params])` — every call site invokes it inline
/// during `build()`, so every layer below is an already-resolved in-memory
/// map, never queried from Drift per key.
///
/// Layered lookup, most specific first:
///   1. [cache] — the Drift-backed bundle for [language], last synced via
///      `GET /i18n/bundle/:lang` (full or delta). For a language that only
///      exists on the server (e.g. `es` imported via xlsx) this is the only
///      language-specific layer.
///   2. The compiled-in map for [language] (`StaticTranslatorRu`/`En`),
///      when there is one — covers a brand-new offline install and keys
///      newer than the last synced bundle.
///   3. English — §9.3 "Отсутствующий перевод → fallback на `en`": first
///      `englishCache` (the synced `en` bundle), then the compiled-in
///      English map.
///   4. The raw key, so an unknown key still renders something.
class L10nTranslator implements Translator {
  L10nTranslator({
    required this.language,
    required this.cache,
    Map<String, String> englishCache = const {},
  })  : _englishCache = language == AppLanguage.en ? cache : englishCache,
        _compiled = compiledSeedFor(language.code);

  final AppLanguage language;
  final Map<String, String> cache;
  final Map<String, String> _englishCache;
  final Map<String, String>? _compiled;

  static final Map<String, String> _compiledEnglish = compiledSeedFor('en')!;

  /// Layers 1–3; `null` when the key is unknown everywhere.
  String? lookup(String key) =>
      cache[key] ?? _compiled?[key] ?? _englishCache[key] ?? _compiledEnglish[key];

  @override
  String t(String key, [Map<String, String>? params]) =>
      interpolate(lookup(key) ?? key, params);

  /// Resolved in two stages so categories never mix across languages
  /// (English has no `few`/`many`): first [language]'s own layers (1–2)
  /// with [language]'s CLDR rules (`key.<category>` → `key.other`); only
  /// when the language has neither does it fall back to English layers
  /// with English CLDR rules. `{count}` is always formatted for
  /// [language].
  @override
  String plural(String key, num count, [Map<String, String>? params]) {
    final own = resolvePlural(language.code, key, count, (k) => cache[k] ?? _compiled?[k]);
    final template = own ??
        resolvePlural('en', key, count, (k) => _englishCache[k] ?? _compiledEnglish[k]) ??
        '$key.other';
    return interpolate(template, {
      'count': formatPluralCount(language.code, count),
      ...?params,
    });
  }
}
