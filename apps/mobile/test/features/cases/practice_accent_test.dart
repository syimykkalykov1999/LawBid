import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-15: every practice has its own colour, readable on dark
/// and light, and the text on it is legible.
void main() {
  test('every practice category gets its own colour', () {
    for (final dark in [true, false]) {
      final seen = <int>{};
      for (final code in kPracticeArtAssets.where((c) => !c.contains('.'))) {
        final c = practiceAccent(code, dark: dark);
        // Distinct hues (rounded to 2 degrees) for distinct practices.
        final hue = HSLColor.fromColor(c).hue ~/ 2;
        expect(seen.add(hue), isTrue, reason: '$code repeats a hue');
        final on = onPracticeAccent(c);
        final l1 = c.computeLuminance();
        final l2 = on.computeLuminance();
        final contrast = (l1 > l2 ? l1 + 0.05 : l2 + 0.05) /
            (l1 > l2 ? l2 + 0.05 : l1 + 0.05);
        expect(contrast, greaterThan(3), reason: '$code text contrast');
      }
    }
  });
}
