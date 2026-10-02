import 'package:intl/intl.dart';

/// CLDR plural categories as they appear as key suffixes
/// (docs/01_FOUNDATION_AUTH.md §9.2: `.one`, `.few`, `.many`, `.other`;
/// `zero`/`two` are included because CLDR defines them for some languages
/// the server may add, e.g. `ar`).
enum PluralCategory { zero, one, two, few, many, other }

/// The CLDR plural category of [count] in [languageCode]. Delegates to
/// `package:intl`'s generated CLDR rule tables (not a hand-rolled copy),
/// with `useExplicitNumberCases: false` so the result is the pure CLDR
/// category — e.g. Russian 21 → `one`, 22 → `few`, 25 → `many`, 1.5 →
/// `other`. A language intl has no rules for gets CLDR's `default` rule.
PluralCategory pluralCategoryOf(String languageCode, num count) {
  return Intl.pluralLogic<PluralCategory>(
    count,
    locale: languageCode,
    zero: PluralCategory.zero,
    one: PluralCategory.one,
    two: PluralCategory.two,
    few: PluralCategory.few,
    many: PluralCategory.many,
    other: PluralCategory.other,
    useExplicitNumberCases: false,
  );
}

/// Resolves the plural string for [count]: `base.<category>` when [lookup]
/// has it, else `base.other`, else `null` (the caller decides the
/// last-resort fallback). [lookup] returns `null` for a missing key.
String? resolvePlural(
  String languageCode,
  String base,
  num count,
  String? Function(String key) lookup,
) {
  final category = pluralCategoryOf(languageCode, count);
  return lookup('$base.${category.name}') ??
      lookup('$base.${PluralCategory.other.name}');
}

/// `{count}` for plural strings: [count] formatted with the language's
/// decimal pattern (`1,234` en / `1 234` ru). Falls back to `en` for a
/// language intl has no number symbols for.
String formatPluralCount(String languageCode, num count) {
  final locale = Intl.verifiedLocale(
    languageCode,
    NumberFormat.localeExists,
    onFailure: (_) => 'en',
  );
  return NumberFormat.decimalPattern(locale).format(count);
}

/// Substitutes `{name}` placeholders in [template].
String interpolate(String template, Map<String, String>? params) {
  if (params == null) return template;
  var value = template;
  for (final entry in params.entries) {
    value = value.replaceAll('{${entry.key}}', entry.value);
  }
  return value;
}

/// Shared `Translator.plural` body — see that doc comment. [lookup] is the
/// translator's own layered lookup; a key missing everywhere renders as
/// `key.other` (same "never blank" rule as `t()`'s raw-key fallback).
String pluralize({
  required String languageCode,
  required String key,
  required num count,
  required String? Function(String key) lookup,
  Map<String, String>? params,
}) {
  final template =
      resolvePlural(languageCode, key, count, lookup) ?? '$key.other';
  return interpolate(template, {
    'count': formatPluralCount(languageCode, count),
    ...?params,
  });
}
