import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-15: every colour of the Tasks board — the ring, the pills,
/// the hero's week bars, the done mark — reads with enough contrast in every
/// theme (Day, Night, Navy, Glass) and for every practice colour.
void main() {
  for (final id in AppThemeId.values) {
    final colors = AppTheme.of(id).extension<AppColorTokens>()!;
    final base = practiceCardBase(colors);
    final categories = kPracticeArtAssets.where((c) => !c.contains('.'));

    test('pills are readable in ${id.name} for every colour', () {
      final tones = <String, Color>{
        'goldDark': colors.goldDark,
        'info': colors.info,
        'success': colors.success,
        'danger': colors.danger,
        'textSecondary': colors.textSecondary,
        'text': colors.text,
        for (final c in categories) c: practiceAccent(c, surface: base),
      };
      for (final MapEntry(key: name, value: color) in tones.entries) {
        final bg = Color.alphaBlend(color.withValues(alpha: 0.16), base);
        expect(
          contrastRatio(readableOn(color, bg), bg),
          greaterThanOrEqualTo(4.5),
          reason: 'pill $name in ${id.name}',
        );
      }
    });

    test('ring icons and marks are visible in ${id.name}', () {
      for (final c in categories) {
        final accent = practiceAccent(c, surface: base);
        expect(
          contrastRatio(readableOn(accent, base, min: 3), base),
          greaterThanOrEqualTo(3),
          reason: 'ring icon $c in ${id.name}',
        );
      }
      for (final ring in [colors.danger, colors.success]) {
        expect(
          contrastRatio(readableOn(ring, base, min: 3), base),
          greaterThanOrEqualTo(3),
          reason: 'ring in ${id.name}',
        );
      }
      // The check on the green done circle.
      expect(
        contrastRatio(onPracticeAccent(colors.success), colors.success),
        greaterThanOrEqualTo(4.5),
        reason: 'done check in ${id.name}',
      );
      // A «done» card text, an overdue date and the hint line on the card.
      expect(
        contrastRatio(colors.dangerText, base),
        greaterThanOrEqualTo(4.5),
        reason: 'overdue date in ${id.name}',
      );
      expect(
        contrastRatio(colors.textSecondary, base),
        greaterThanOrEqualTo(4.5),
        reason: 'secondary text in ${id.name}',
      );
    });

    test('the hero week letters are readable in ${id.name}', () {
      for (final letter in [colors.text, colors.textSecondary]) {
        expect(
          contrastRatio(readableOn(letter, base), base),
          greaterThanOrEqualTo(4.5),
          reason: 'week letter in ${id.name}',
        );
      }
    });
  }
}
