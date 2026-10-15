import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-15: the practice name, icon and price on an «Active» card
/// header read with at least 4.5:1 contrast in every theme and for every
/// practice category (the visa header melted into the Glass theme).
void main() {
  for (final id in AppThemeId.values) {
    test('header text is readable in ${id.name} for every category', () {
      final colors = AppTheme.of(id).extension<AppColorTokens>()!;
      final base = practiceCardBase(colors);
      final categories = kPracticeArtAssets.where((c) => !c.contains('.'));
      expect(categories, isNotEmpty);
      for (final cat in categories) {
        final accent = practiceAccent(cat, surface: base);
        final bg = Color.alphaBlend(accent.withValues(alpha: 0.22), base);
        expect(
          contrastRatio(readableOn(accent, bg), bg),
          greaterThanOrEqualTo(4.5),
          reason: '$cat in ${id.name}',
        );
        expect(
          contrastRatio(readableOn(colors.goldDark, bg), bg),
          greaterThanOrEqualTo(4.5),
          reason: 'price on $cat in ${id.name}',
        );
      }
    });
  }
}
