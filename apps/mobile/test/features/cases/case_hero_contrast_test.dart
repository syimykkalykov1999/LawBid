import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-15: the case head (practice name over the tinted gradient,
/// the title and the facts over the base) reads in every theme and for every
/// practice colour.
void main() {
  for (final id in AppThemeId.values) {
    test('case hero is readable in ${id.name}', () {
      final colors = AppTheme.of(id).extension<AppColorTokens>()!;
      final base = practiceCardBase(colors);
      final categories = kPracticeArtAssets.where((c) => !c.contains('.'));
      for (final cat in categories) {
        final accent = practiceAccent(cat, surface: base);
        final top = Color.alphaBlend(accent.withValues(alpha: 0.2), base);
        expect(
          contrastRatio(readableOn(accent, top), top),
          greaterThanOrEqualTo(4.5),
          reason: 'practice name on $cat in ${id.name}',
        );
        expect(
          contrastRatio(colors.text, top),
          greaterThanOrEqualTo(4.5),
          reason: 'title on $cat in ${id.name}',
        );
      }
    });
  }
}
