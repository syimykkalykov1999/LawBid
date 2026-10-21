import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// WCAG contrast of the text colour tokens against the surfaces they sit on,
/// in all four themes. Replaces the pixel-sampling guideline (which reads
/// anti-aliased glyph edges as "text" and differs per OS): this is the same
/// 4.5:1 body-text rule on the actual colours.
double _lum(Color c) {
  double ch(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

double _ratio(Color a, Color b) {
  final la = _lum(a);
  final lb = _lum(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

Color _over(Color fg, Color bg) => Color.alphaBlend(fg, bg);

void main() {
  final themes = {
    'day': AppColorTokens.light(),
    'night': AppColorTokens.dark(),
    'navy': AppColorTokens.navy(),
    'glass': AppColorTokens.glass(),
  };

  for (final e in themes.entries) {
    test('${e.key}: text and secondary text reach 4.5:1 on their surfaces', () {
      final c = e.value;
      // Glass is see-through: its text sits on the gradient stops and on the
      // light spots drawn over them; the other themes on bg / surface.
      final backs = <Color>[
        if (c.isGlass) ...[
          for (final g in c.bgGradient!) _over(c.surface, g),
          for (final g in c.bgGradient!)
            for (final s in c.bgSpots) _over(c.surface, _over(s, g)),
          c.sheet,
        ] else ...[
          c.bg,
          _over(c.surface, c.bg),
        ],
      ];
      for (final back in backs) {
        final opaque = Color.alphaBlend(back, const Color(0xFF000000));
        expect(
          _ratio(_over(c.text, opaque), opaque),
          greaterThanOrEqualTo(4.5),
          reason: '${e.key} text on $back',
        );
        expect(
          _ratio(_over(c.textSecondary, opaque), opaque),
          greaterThanOrEqualTo(4.5),
          reason: '${e.key} textSecondary on $back',
        );
        // Gold for small text (links, captions) must read too.
        expect(
          _ratio(_over(c.goldText, opaque), opaque),
          greaterThanOrEqualTo(4.5),
          reason: '${e.key} goldText on $back',
        );
      }
    });
  }

  for (final e in themes.entries) {
    test('${e.key}: tinted icons are the theme ink, not gold, and read 3:1',
        () {
      final c = e.value;
      expect(c.iconTint, isNot(c.gold));
      expect(c.iconTint, isNot(c.goldDark));
      final back = c.isGlass ? c.sheet : c.bg;
      final opaque = Color.alphaBlend(back, const Color(0xFF000000));
      expect(_ratio(c.iconTint, opaque), greaterThanOrEqualTo(3));
    });
  }
}
