import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';

/// Owner 2026-10-07: no screen, on the phone or on the web, may show a raw
/// key or an untranslated text. Every literal key the code passes to
/// `t(...)` / `plural(...)` must exist in the compiled-in English layer
/// (the fallback every language ends on) and in the translations workbook
/// (test/l10n/longest_strings.json, built from it by
/// tool/gen_longest_strings.py), so translators have it in every language.
/// The web client runs the same code, so this covers it too.
void main() {
  final call = RegExp(r"\b(t|plural)\(\s*'([a-zA-Z][a-zA-Z0-9_.]*)'");
  final used = <String, Set<String>>{};
  for (final f in Directory('lib').listSync(recursive: true)) {
    if (f is! File || !f.path.endsWith('.dart')) continue;
    if (f.path.endsWith('.g.dart') || f.path.endsWith('.freezed.dart')) {
      continue;
    }
    for (final m in call.allMatches(f.readAsStringSync())) {
      // Only dotted keys: plain words are other functions' arguments.
      if (!m.group(2)!.contains('.')) continue;
      used.putIfAbsent(m.group(1)!, () => {}).add(m.group(2)!);
    }
  }
  final en = const StaticTranslatorEn().seedEntries.keys.toSet();
  final workbook = (jsonDecode(
    File('test/l10n/longest_strings.json').readAsStringSync(),
  ) as Map<String, dynamic>)
      .keys
      .toSet();

  bool has(Set<String> keys, String kind, String key) => kind == 'plural'
      ? keys.contains('$key.other') || keys.contains(key)
      : keys.contains(key);

  List<String> missingFrom(Set<String> keys) => [
        for (final e in used.entries)
          for (final k in e.value)
            if (!has(keys, e.key, k)) k,
      ]..sort();

  test('every key used in the code has English text', () {
    expect(missingFrom(en), isEmpty, reason: 'Keys without English text');
  });

  // Keys that shipped before this check with English text only: every
  // other language shows them in English until they are translated. The
  // list may only shrink; a new key must reach the workbook first.
  final baseline = File('test/l10n/untranslated_baseline.txt')
      .readAsLinesSync()
      .where((l) => l.isNotEmpty && !l.startsWith('#'))
      .toSet();

  test('every new key used in the code is in the translations workbook', () {
    final missing = missingFrom(workbook);
    expect(
      missing.where((k) => !baseline.contains(k)).toList(),
      isEmpty,
      reason: 'Keys missing from the workbook (translate them in every '
          'language, then rerun tool/gen_longest_strings.py)',
    );
    expect(
      baseline.where((k) => !missing.contains(k)).toList()..sort(),
      isEmpty,
      reason: 'Translated now: remove them from '
          'test/l10n/untranslated_baseline.txt',
    );
  });
}
