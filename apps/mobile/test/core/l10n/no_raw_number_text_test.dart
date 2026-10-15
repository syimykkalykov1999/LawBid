import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-15: numbers the user reads go through the language's own
/// digits (`context.digits(...)` / `formats.digits(...)`), never a bare
/// `Text('$n')` that shows 0–9 in Nepali, Arabic and the others.
void main() {
  test('no Text shows a bare interpolated number', () {
    const interp = r'''(?:\$\{[^}'"(]*\}|\$[A-Za-z_]\w*)''';
    final bare = RegExp(
      'Text\\(\\s*[\'"]($interp(?:/$interp)*)[\'"]',
    );
    final hits = <String>[];
    for (final f in Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))) {
      final text = f.readAsStringSync();
      for (final m in bare.allMatches(text)) {
        final line = text.substring(0, m.start).split('\n').length;
        hits.add('${f.path}:$line ${m.group(1)}');
      }
    }
    expect(hits, isEmpty, reason: hits.join('\n'));
  });
}
