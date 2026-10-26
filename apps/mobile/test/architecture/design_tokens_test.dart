import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-14 (architecture audit, step 8): colours and font sizes
/// come from the theme tokens, so one change restyles the whole app. Raw
/// `Color(0x…)` and `fontSize:` outside `core/design_system` and `core/theme`
/// are counted per file; the numbers may only go down. Refresh after
/// fixing some: `UPDATE_BOUNDARIES=1 flutter test test/architecture`.
void main() {
  final baselineFile = File('test/architecture/design_tokens_baseline.json');
  final colorRe = RegExp(r'Color\(0x[0-9A-Fa-f]{6,8}\)');
  final sizeRe = RegExp(r'fontSize:\s*\d');
  final now = <String, int>{};
  for (final f
      in Directory('lib').listSync(recursive: true).whereType<File>()) {
    final path = f.path;
    if (!path.endsWith('.dart') || path.endsWith('.g.dart')) continue;
    if (path.contains('/core/design_system/') ||
        path.contains('/core/theme/')) {
      continue;
    }
    final text = f.readAsStringSync();
    final n = colorRe.allMatches(text).length + sizeRe.allMatches(text).length;
    if (n > 0) now[path.substring(4)] = n;
  }
  if (Platform.environment['UPDATE_BOUNDARIES'] == '1') {
    final sorted = Map.fromEntries(
      now.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
    baselineFile.writeAsStringSync(
      '${const JsonEncoder.withIndent(' ').convert(sorted)}\n',
    );
  }
  final base =
      (jsonDecode(baselineFile.readAsStringSync()) as Map).cast<String, int>();

  test('no file gains raw colours or font sizes', () {
    final grew = now.entries.where((e) => e.value > (base[e.key] ?? 0));
    expect(
      grew.map((e) => '${e.key}: ${e.value} > ${base[e.key] ?? 0}'),
      isEmpty,
    );
  });
}
