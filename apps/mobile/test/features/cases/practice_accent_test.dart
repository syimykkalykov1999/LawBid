import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/theme/app_theme_id.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

double _contrast(Color a, Color b) {
  final x = a.computeLuminance();
  final y = b.computeLuminance();
  final hi = x > y ? x : y;
  final lo = x > y ? y : x;
  return (hi + 0.05) / (lo + 0.05);
}

/// Owner 2026-10-15: every practice has its own colour, and it stays
/// readable in every theme (Day, Night, Blue, Green): the colour stands out
/// from the card, the text on the chip and on the tinted header band is
/// legible.
void main() {
  final categories = kPracticeArtAssets.where((c) => !c.contains('.')).toList()
    ..sort();

  test('every practice category gets its own hue', () {
    final seen = <int>{};
    for (final code in categories) {
      final c = practiceAccent(code, surface: const Color(0xFF101828));
      final hue = HSLColor.fromColor(c).hue ~/ 2;
      expect(seen.add(hue), isTrue, reason: '$code repeats a hue');
    }
  });

  for (final spec in AppThemes.all) {
    test('${spec.wire}: colours stand out and texts stay legible', () {
      final tokens = spec.tokens();
      final surface = practiceCardBase(tokens);
      for (final code in categories) {
        final accent = practiceAccent(code, surface: surface);
        expect(
          _contrast(accent, surface),
          greaterThanOrEqualTo(3),
          reason: '$code vs surface in ${spec.wire}',
        );
        expect(
          _contrast(onPracticeAccent(accent), accent),
          greaterThanOrEqualTo(3),
          reason: '$code chip text in ${spec.wire}',
        );
        // The header band is the accent at 16% over the surface; the
        // theme's own text colour must read on it.
        final band = Color.alphaBlend(
          accent.withValues(alpha: 0.16),
          surface,
        );
        expect(
          _contrast(tokens.text, band),
          greaterThanOrEqualTo(4.5),
          reason: '$code band text in ${spec.wire}',
        );
      }
    });
  }
}
