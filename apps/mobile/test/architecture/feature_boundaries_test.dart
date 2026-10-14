import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-14 (architecture audit, step 1): a feature does not reach
/// into another feature's `data/` layer (repositories, DTO mapping) — it
/// goes through that feature's `application/` providers. Today's violations
/// are recorded in `feature_boundaries_baseline.json` and may only shrink;
/// a feature's fan-out (other features it imports) may not grow either.
/// Refresh the baseline after fixing some: `UPDATE_BOUNDARIES=1 flutter test
/// test/architecture`.
void main() {
  final root = Directory('lib/features');
  final baselineFile =
      File('test/architecture/feature_boundaries_baseline.json');
  final importRe =
      RegExp(r"import\s+'package:lawbid/features/([a-z_]+)/([^']+)'");

  final deep = <String>{};
  final edges = <String, Set<String>>{};
  for (final f in root.listSync(recursive: true).whereType<File>()) {
    if (!f.path.endsWith('.dart')) continue;
    final parts = f.path.split('/');
    final own = parts[parts.indexOf('features') + 1];
    for (final m in importRe.allMatches(f.readAsStringSync())) {
      final other = m.group(1)!;
      if (other == own) continue;
      edges.putIfAbsent(own, () => {}).add(other);
      if (m.group(2)!.startsWith('data/')) {
        deep.add('${f.path.substring(4)} -> $other/${m.group(2)}');
      }
    }
  }
  final now = {
    'deep': deep.toList()..sort(),
    'fanOut': {
      for (final e
          in (edges.entries.toList()..sort((a, b) => a.key.compareTo(b.key))))
        e.key: e.value.length,
    },
  };
  if (Platform.environment['UPDATE_BOUNDARIES'] == '1') {
    baselineFile.writeAsStringSync(
      '${const JsonEncoder.withIndent(' ').convert(now)}\n',
    );
  }
  final base =
      jsonDecode(baselineFile.readAsStringSync()) as Map<String, dynamic>;

  test("no new import of another feature's data layer", () {
    final known = (base['deep'] as List).cast<String>().toSet();
    expect((now['deep']! as List).where((d) => !known.contains(d)), isEmpty);
  });

  test('a fixed violation is removed from the baseline (it only shrinks)', () {
    final current = (now['deep']! as List).toSet();
    expect((base['deep'] as List).where((d) => !current.contains(d)), isEmpty);
  });

  test('no feature depends on more features than recorded', () {
    final recorded = (base['fanOut'] as Map).cast<String, int>();
    final fan = now['fanOut']! as Map<String, int>;
    expect(fan.entries.where((e) => e.value > (recorded[e.key] ?? 0)), isEmpty);
  });
}
