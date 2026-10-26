import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';

// WCAG 2.x 1.4.11 Non-text Contrast: graphical objects need >= 3:1.
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

void main() {
  final themes = <String, AppColorTokens>{
    'day': AppColorTokens.light(),
    'night': AppColorTokens.dark(),
    'blue': AppColorTokens.blue(),
    'green': AppColorTokens.green(),
  };

  for (final e in themes.entries) {
    test('${e.key}: client gold check reads on page and card (>= 3:1)', () {
      final t = e.value;
      expect(_ratio(t.verifiedGold, t.bg), greaterThanOrEqualTo(3));
      expect(_ratio(t.verifiedGold, t.surface), greaterThanOrEqualTo(3));
    });

    test('${e.key}: white icon on attorney green badge (>= 3:1)', () {
      expect(
        _ratio(e.value.verifiedGreen, const Color(0xFFFFFFFF)),
        greaterThanOrEqualTo(3),
      );
    });
  }
}
