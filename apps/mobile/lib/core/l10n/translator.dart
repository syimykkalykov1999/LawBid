/// Minimal string-lookup abstraction so widgets never hardcode user-facing
/// text (file 07 §D.1 acceptance: "нет hardcode-цветов и строк";
/// docs/01_FOUNDATION_AUTH.md §9.4: "Свой лёгкий слой `L10n` (не generated
/// ARB), `t('key', args)`").
///
/// Implementations: `L10nTranslator` (l10n_translator.dart — the real,
/// backend-driven one `translatorProvider` returns) and the compiled-in
/// `StaticTranslatorRu`/`En` maps (static_translator.dart), which are its
/// seed/fallback layer.
abstract interface class Translator {
  /// Looks up [key] and substitutes `{name}` placeholders from [params].
  String t(String key, [Map<String, String>? params]);

  /// Plural-aware lookup (§9.2: "Плюрализация: ключи с суффиксами `.one`,
  /// `.few`, `.many`, `.other` (правила CLDR)"). Picks `key.<category>` for
  /// [count] by the CLDR rules of this translator's language, falling back
  /// to `key.other`. `{count}` is filled with [count] formatted for the
  /// language (e.g. `1,000` / `1 000`) unless [params] sets it explicitly.
  String plural(String key, num count, [Map<String, String>? params]);
}
