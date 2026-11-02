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

  test('no AnimatedSize takes Duration.zero (policy)', () {
    final bad = <String>[];
    for (final f in Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))) {
      final s = f.readAsStringSync();
      for (final m in RegExp(r'AnimatedSize\(').allMatches(s)) {
        final head = s.substring(m.end, (m.end + 200).clamp(0, s.length));
        if (RegExp(r'duration:[^,]*Duration\.zero').hasMatch(head)) {
          bad.add(f.path);
        }
      }
    }
    expect(bad, isEmpty, reason: 'use context.sizeChangeDuration');
  });
}
