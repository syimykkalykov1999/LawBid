import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';

/// Owner 2026-10-23: pressing back on the chats tab showed the raw key
/// «nav.backAgainToExit». Texts asked for outside any screen (app.dart, the
/// router and shell) have no bundle to fall back on while it loads, so each
/// must be in the built-in Russian and English seeds.
void main() {
  test('every key asked for in app.dart and core/navigation has a seed text',
      () {
    final keys = <String>{};
    final files = [
      File('lib/app.dart'),
      ...Directory('lib/core/navigation')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart')),
    ];
    final re = RegExp(r"\.t\(\s*'([a-zA-Z0-9_.]+)'");
    for (final f in files) {
      for (final m in re.allMatches(f.readAsStringSync())) {
        keys.add(m.group(1)!);
      }
    }
    expect(keys, contains('nav.backAgainToExit'));
    final ru = const StaticTranslatorRu().seedEntries;
    final en = const StaticTranslatorEn().seedEntries;
    for (final k in keys) {
      expect(ru.containsKey(k), isTrue, reason: 'ru seed lacks $k');
      expect(en.containsKey(k), isTrue, reason: 'en seed lacks $k');
    }
  });
}
