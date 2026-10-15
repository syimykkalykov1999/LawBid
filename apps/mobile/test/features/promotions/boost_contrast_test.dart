import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/promotions/presentation/boost_colors.dart';

/// Owner 2026-10-15: every colour pair of the Boost screens reads in every
/// theme (Day, Night, Navy, Glass): the button text on its gold tint, the
/// chosen card, the numbers and labels on the stats tiles, the credit line,
/// the ad label.
void main() {
  for (final id in AppThemeId.values) {
    final c = AppTheme.of(id).extension<AppColorTokens>()!;
    // The tint is translucent in some themes: the card colour under it.
    final card = practiceCardBase(c);
    final tint = Color.alphaBlend(c.goldTint, card);

    test('Boost text is readable in ${id.name}', () {
      final pairs = <String, (Color, Color)>{
        'button label on its tint': (c.boostInk(), tint),
        'chosen goal title on its tint': (readableOn(c.text, tint), tint),
        'estimate caption on its tint': (
          readableOn(c.textSecondary, tint),
          tint
        ),
        'estimate numbers on its tint': (readableOn(c.text, tint), tint),
        'stat label on the tile': (c.textSecondary, card),
        'stat value on the tile': (c.text, card),
        'ad label on the card': (c.textSecondary, card),
        'credit line on the sheet': (readableOn(c.success, card), card),
        'status «running» on its tint': (c.boostInk(), tint),
        'status on the tile': (c.textSecondary, card),
      };
      for (final e in pairs.entries) {
        expect(
          contrastRatio(e.value.$1, e.value.$2),
          greaterThanOrEqualTo(4.5),
          reason: '${e.key} in ${id.name}',
        );
      }
    });

    test('Boost marks are visible in ${id.name}', () {
      // The step bars, the by-day bars and the chosen frame (non-text, 3:1)
      // against the card they sit on.
      expect(
        contrastRatio(c.boostMark(card), card),
        greaterThanOrEqualTo(3),
        reason: 'gold marks in ${id.name}',
      );
    });

    test('the button over a video reads in ${id.name}', () {
      // White on a 38% black plate over any video (worst case: white).
      final plate = Color.alphaBlend(Colors.black38, Colors.white);
      expect(contrastRatio(Colors.white, plate), greaterThanOrEqualTo(2.5));
    });
  }
}
