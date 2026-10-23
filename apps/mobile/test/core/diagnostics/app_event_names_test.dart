import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/diagnostics/app_event_names.dart';

/// Owner 2026-10-22 (checklist §18): the events the app sends are exactly
/// the ones docs/analytics_events.md lists. `flutter test` runs from
/// apps/mobile.
void main() {
  final doc = File('../../docs/analytics_events.md').readAsStringSync();

  /// `| \`name\` | …` rows of every table, grouped by the section they are in.
  Map<String, Set<String>> rowsBySection() {
    final out = <String, Set<String>>{};
    var section = '';
    for (final line in doc.split('\n')) {
      if (line.startsWith('## ')) section = line.substring(3).trim();
      final m = RegExp(r'^\|\s*`([a-z_]+)`\s*\|').firstMatch(line);
      if (m != null) (out[section] ??= {}).add(m.group(1)!);
    }
    return out;
  }

  test('every name the app sends is documented, and nothing else is sent',
      () {
    final sections = rowsBySection();
    final notSent = sections['Not sent'] ?? const <String>{};
    final documented = {
      for (final e in sections.entries)
        if (e.key != 'Not sent') ...e.value,
    };
    expect(documented, isNotEmpty);
    expect(
      AppEventNames.all.difference(documented),
      isEmpty,
      reason: 'sent by the app but not in docs/analytics_events.md',
    );
    expect(
      documented.difference(AppEventNames.all),
      isEmpty,
      reason: 'in docs/analytics_events.md but the app never sends it '
          '(list it under «Not sent» or add the call)',
    );
    expect(notSent.intersection(AppEventNames.all), isEmpty);
  });

  test('the code only tracks names from AppEventNames (no stray literals)',
      () {
    final literal = RegExp(r"""AppEvents\.track\(\s*'([^']+)'""");
    final bad = <String>[];
    for (final f
        in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      for (final m in literal.allMatches(f.readAsStringSync())) {
        bad.add('${f.path}: ${m.group(1)}');
      }
    }
    expect(bad, isEmpty, reason: bad.join('\n'));
  });
}
