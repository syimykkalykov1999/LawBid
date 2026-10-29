import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Pull-to-refresh lives in one place (owner 2026-10-28): features use
/// AppRefreshIndicator, never the framework's RefreshIndicator directly.
void main() {
  test('no feature uses RefreshIndicator directly', () {
    final bad = <String>[];
    final re = RegExp(r'(?<![A-Za-z])RefreshIndicator(State)?\b');
    for (final f
        in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      if (f.path.endsWith('app_refresh_indicator.dart')) continue;
      final lines = f.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        final l = lines[i].trimLeft();
        if (l.startsWith('//')) continue;
        if (re.hasMatch(lines[i])) bad.add('${f.path}:${i + 1}');
      }
    }
    expect(bad, isEmpty);
  });
}
