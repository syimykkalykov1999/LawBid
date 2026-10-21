import 'dart:convert';
import 'dart:io';

import 'package:lawbid/core/l10n/plural_rules.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-21: keys not yet in the translations workbook live in
/// `docs/i18n-pending/<name>.json` (`{key: {lang: text}}`). Overflow tests
/// lay them over a [Translator] so the new screens are measured in the real
/// (or the longest) text, not in the English fallback.
class PendingTranslator implements Translator {
  PendingTranslator(this.base, this.strings);

  /// [lang] of the file [name]; `longest` = the longest text of every key
  /// among all languages (the strictest case).
  factory PendingTranslator.of(Translator base, String name, String lang) {
    final file = File('../../docs/i18n-pending/$name.json');
    final all = file.existsSync()
        ? (jsonDecode(file.readAsStringSync()) as Map<String, dynamic>)
        : const <String, dynamic>{};
    final picked = <String, String>{};
    for (final MapEntry(key: key, value: byLang) in all.entries) {
      final m = (byLang as Map<String, dynamic>).cast<String, String>();
      final text = lang == 'longest'
          ? m.values.reduce((a, b) => b.length > a.length ? b : a)
          : m[lang];
      if (text != null) picked[key] = text;
    }
    return PendingTranslator(base, picked);
  }

  final Translator base;
  final Map<String, String> strings;

  @override
  String t(String key, [Map<String, String>? params]) {
    final s = strings[key];
    return s == null ? base.t(key, params) : interpolate(s, params);
  }

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      base.plural(key, count, params);
}
