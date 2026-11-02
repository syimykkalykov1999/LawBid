import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-11-02: with the phone's «remove animations» on, an
/// `AnimatedSize(duration: Duration.zero)` asserts in debug ("mutated in its
/// own performLayout"). Every AnimatedSize takes `context.sizeChangeDuration`
/// (1 ms under reduce-motion) instead.
void main() {
  testWidgets('AnimatedSize with sizeChangeDuration, animations disabled',
      (tester) async {
    var big = false;
    late StateSetter set;
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: StatefulBuilder(
            builder: (context, setState) {
              set = setState;
              return Column(
                children: [
                  AnimatedSize(
                    duration: context.sizeChangeDuration,
                    child: big
                        ? const SizedBox(width: 100, height: 100)
                        : const SizedBox(width: double.infinity),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
    set(() => big = true);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(tester.takeException(), isNull);
    expect(
      tester.getSize(find.byType(SizedBox).last).height,
      100,
      reason: 'the final state shows at once',
    );
  });

  test('every AnimatedSize takes sizeChangeDuration (policy)', () {
    // Wrappers that skip AnimatedSize themselves when the duration is zero.
    const guarded = {
      'document_slot_card.dart',
      'plan_picker.dart',
    };
    final bad = <String>[];
    var seen = 0;
    for (final f in Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))) {
      final s = f.readAsStringSync();
      for (final m in RegExp(r'\bAnimatedSize\(').allMatches(s)) {
        seen++;
        final d = RegExp(r'duration:\s*([^,]+),')
            .firstMatch(s.substring(m.end))
            ?.group(1)
            ?.trim();
        final ok = d != null &&
            (d == 'context.sizeChangeDuration' ||
                d.startsWith('AppMotion.') ||
                (d == 'duration' && guarded.any((g) => f.path.endsWith(g))));
        if (!ok) bad.add('${f.path}: duration: $d');
      }
    }
    expect(seen, greaterThan(5), reason: 'run from apps/mobile');
    expect(bad, isEmpty, reason: 'use context.sizeChangeDuration');
  });
}
