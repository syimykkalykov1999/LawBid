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
    'blue': AppColorTokens.blue(),
    'green': AppColorTokens.green(),
  };

  for (final e in themes.entries) {
    test('${e.key}: text and secondary text reach 4.5:1 on their surfaces', () {
      final c = e.value;
      final backs = <Color>[
        c.bg,
        _over(c.surface, c.bg),
        c.sheet,
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
      final back = c.bg;
      final opaque = Color.alphaBlend(back, const Color(0xFF000000));
      expect(_ratio(c.iconTint, opaque), greaterThanOrEqualTo(3));
    });
  }

  // Owner 2026-10-23: Blue (Citi) and Green (Credit Karma) are solid
  // full-colour themes built like Night; the primary button is white with
  // the brand colour as its label, and everything stays AA.
  for (final name in ['blue', 'green']) {
    final c = themes[name]!;
    test('$name: solid page, white primary button, AA everywhere', () {
      expect(c.bg.computeLuminance(), lessThan(0.25), reason: 'dark page');
      expect(c.text, const Color(0xFFFFFFFF));
      expect(c.accent, const Color(0xFFFFFFFF));
      expect(c.ctaBright, const Color(0xFFFFFFFF));
      expect(c.hasHeaderWash, isFalse);
      // The button label on the white button, and on every surface.
      expect(_ratio(c.onAccent, c.accent), greaterThanOrEqualTo(4.5));
      expect(_ratio(c.onCtaBright, c.ctaBright), greaterThanOrEqualTo(4.5));
      final backs = [c.bg, c.surface, c.sheet, c.chip, c.barFill];
      for (final back in backs) {
        for (final ink in [c.text, c.textSecondary, c.dangerText, c.goldText]) {
          expect(
            _ratio(ink, back),
            greaterThanOrEqualTo(4.5),
            reason: '$name $ink on $back',
          );
        }
      }
      // Chat bubbles.
      final chat = ChatColors.forTokens(
        c,
        Brightness.dark,
      );
      expect(_ratio(chat.onMine, chat.mine), greaterThanOrEqualTo(4.5));
      expect(_ratio(chat.mineMeta, chat.mine), greaterThanOrEqualTo(4.5));
      expect(_ratio(chat.onTheirs, chat.theirs), greaterThanOrEqualTo(4.5));
      expect(_ratio(chat.theirsMeta, chat.theirs), greaterThanOrEqualTo(4.5));
      expect(_ratio(c.text, chat.wallpaper), greaterThanOrEqualTo(4.5));
    });
  }
}
