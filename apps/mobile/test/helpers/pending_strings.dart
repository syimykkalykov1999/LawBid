import 'dart:convert';
import 'dart:io';

import 'package:lawbid/core/l10n/plural_rules.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-21: strings written for every language but not merged into
/// the translations workbook yet (docs/i18n-pending/*.json, `{key: {lang:
/// text}}`). The long-locale tests read them on top of the generated test
/// languages, so a new screen is checked in its real Nepali / Arabic /
/// longest text before the workbook is regenerated. A missing folder (the
/// files were merged and removed) changes nothing.
Map<String, Map<String, String>> _pending() {
  final dir = Directory('../../docs/i18n-pending');
  if (!dir.existsSync()) return const {};
  final out = <String, Map<String, String>>{};
  for (final f in dir.listSync().whereType<File>()) {
    if (!f.path.endsWith('.json')) continue;
    final json = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
    for (final e in json.entries) {
      out[e.key] = (e.value as Map<String, dynamic>).cast<String, String>();
    }
  }
  return out;
}

final _all = _pending();

/// [base] with the pending strings of [lang] on top; `null` = the longest
/// text of each key among all languages (the LongestTranslator idea).
Translator withPending(Translator base, String? lang) {
  final extra = <String, String>{
    for (final e in _all.entries)
      if (lang == null)
        e.key: e.value.values.reduce((a, b) => b.length > a.length ? b : a)
      else if (e.value[lang] != null)
        e.key: e.value[lang]!,
  };
  return extra.isEmpty ? base : _Overlay(base, extra);
}

class _Overlay implements Translator {
  _Overlay(this._base, this._extra);

  final Translator _base;
  final Map<String, String> _extra;

  @override
  String t(String key, [Map<String, String>? params]) {
    final own = _extra[key];
    return own == null ? _base.t(key, params) : interpolate(own, params);
  }

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      _base.plural(key, count, params);
}

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
